// ---------------------------------------------------------------------------
// Embedder
// Wraps @huggingface/transformers for local ONNX-based embeddings.
// Lazy-loaded on first use — no model download at server startup.
//
// @huggingface/transformers is an optional dependency. The import is
// guarded with a try/catch so the server starts without it.
// ---------------------------------------------------------------------------

// Type-only imports are erased at compile time; the module itself is loaded
// on first use in load().
import type { FeatureExtractionPipeline, Tensor } from '@huggingface/transformers';
import { DEFAULT_SEARCH_MODEL } from '../config.js';

type TransformersModule = typeof import('@huggingface/transformers');

// Sequence length a model was trained on (max_seq_length in its
// sentence_bert_config.json). transformers.js does not read that file and
// truncates at the tokenizer's model_max_length instead — 512 for the default
// model, which is trained on 128. Longer input is out of distribution: the
// vectors of long issues collapse into one another (#8539). Models not listed
// keep the tokenizer's limit.
const MODEL_MAX_TOKENS: Record<string, number> = {
  [DEFAULT_SEARCH_MODEL]: 128,
};

// Vectors per issue for models with a known token limit: the first covers
// summary and the start of the description, each further one the next part of
// the description, prefixed with the summary (#8541). 8 chunks reach about
// 1,000 description tokens and grow the index by a factor of about 1.7.
const MAX_CHUNKS = 8;
// Special tokens the tokenizer adds ([CLS], [SEP]) plus the newline.
const CHUNK_OVERHEAD_TOKENS = 3;
const MIN_CHUNK_TOKENS = 32;
// Characters per token kept before tokenizing: tokens average about 4
// characters, so this keeps well beyond MAX_CHUNKS windows without tokenizing
// descriptions of 17,000+ tokens in full.
const MAX_CHARS_PER_TOKEN = 16;
// Texts per model call; caps the activation memory of a batch.
const MODEL_BATCH_SIZE = 32;

export interface EmbeddingDocument {
  summary: string;
  description?: string;
}

// A loaded model takes ~0.9 GB RAM, and every client session runs its own
// server process. An idle process releases the model; the next use reloads it.
const IDLE_UNLOAD_MS = 10 * 60 * 1000;

export class Embedder {
  /** Identifies how vectors are made; a different signature means the index must be rebuilt. */
  readonly signature: string;

  private pipe: Promise<FeatureExtractionPipeline> | null = null;
  private readonly maxTokens: number | undefined;
  private running = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly modelName: string,
    private readonly numThreads: number = 1,
  ) {
    this.maxTokens = MODEL_MAX_TOKENS[modelName];
    this.signature = this.maxTokens === undefined
      ? `${modelName}|max_tokens=default`
      : `${modelName}|max_tokens=${this.maxTokens}|chunks=${MAX_CHUNKS}`;
  }

  private async withPipeline<T>(fn: (extractor: FeatureExtractionPipeline) => Promise<T>): Promise<T> {
    this.running++;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    try {
      if (!this.pipe) {
        const loading = this.load();
        // Never keep a failed load around — the next call retries.
        loading.catch(() => { if (this.pipe === loading) this.pipe = null; });
        this.pipe = loading;
      }
      return await fn(await this.pipe);
    } finally {
      // The timer only runs while nothing is embedding; unref() keeps it from
      // holding the process alive.
      if (--this.running === 0 && this.pipe) {
        this.idleTimer = setTimeout(() => void this.unload(), IDLE_UNLOAD_MS).unref();
      }
    }
  }

  private async unload(): Promise<void> {
    const pipe = this.pipe!;
    this.idleTimer = null;
    this.pipe = null;
    process.stderr.write(`[mantisbt-search] Unloading idle embedding model ${this.modelName}\n`);
    await (await pipe).dispose?.();
  }

  private async load(): Promise<FeatureExtractionPipeline> {
    process.stderr.write(`[mantisbt-search] Loading embedding model ${this.modelName} (threads: ${this.numThreads})...\n`);

    let transformers: TransformersModule;
    try {
      transformers = await import('@huggingface/transformers');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load @huggingface/transformers: ${msg}`);
    }

    // onnxruntime takes camelCase keys and silently ignores unknown ones
    // (snake_case had no effect until #8540).
    return transformers.pipeline('feature-extraction', this.modelName, {
      session_options: {
        intraOpNumThreads: this.numThreads,
        interOpNumThreads: 1, // Transformer graphs are sequential — no benefit from inter-op parallelism
      },
    });
  }

  /** One or more vectors per document; see MAX_CHUNKS. */
  async embedDocuments(docs: EmbeddingDocument[]): Promise<number[][][]> {
    if (docs.length === 0) return [];
    return this.withPipeline(async ({ tokenizer }) => {
      const texts = docs.map(doc => this.chunkTexts(doc, tokenizer));
      const vectors = await this.embedBatch(texts.flat());
      let start = 0;
      return texts.map(chunks => {
        const own = vectors.slice(start, start + chunks.length);
        start += chunks.length;
        return own;
      });
    });
  }

  private chunkTexts({ summary, description: fullDescription }: EmbeddingDocument, tokenizer: FeatureExtractionPipeline['tokenizer']): string[] {
    const description = this.maxTokens === undefined
      ? fullDescription
      : fullDescription?.slice(0, MAX_CHUNKS * this.maxTokens * MAX_CHARS_PER_TOKEN);
    const texts = [`${summary}\n${description ?? ''}`.trim()];
    if (this.maxTokens === undefined || !description) return texts;

    const encode = (text: string) => tokenizer.encode(text, { add_special_tokens: false });
    const window = Math.max(MIN_CHUNK_TOKENS, this.maxTokens - CHUNK_OVERHEAD_TOKENS - encode(summary).length);
    const tokens = encode(description);
    // The first text already covers about the first window of the description.
    for (let start = window; start < tokens.length && texts.length < MAX_CHUNKS; start += window) {
      const part = tokenizer.decode(tokens.slice(start, start + window), { skip_special_tokens: true });
      texts.push(`${summary}\n${part}`);
    }
    return texts;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0]!;
  }

  // Same steps as the feature-extraction pipeline with pooling 'mean' and
  // normalize — but the pipeline offers no way to pass max_length.
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.withPipeline(async ({ tokenizer, model }) => {
      // Already loaded by load(), so this resolves from the module cache.
      const { mean_pooling } = await import('@huggingface/transformers');
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += MODEL_BATCH_SIZE) {
        const inputs = tokenizer(texts.slice(i, i + MODEL_BATCH_SIZE), { padding: true, truncation: true, max_length: this.maxTokens });
        const outputs = (await model(inputs)) as Record<string, Tensor | undefined>;
        const tokenVectors = outputs['last_hidden_state'] ?? outputs['logits'] ?? outputs['token_embeddings'];
        if (!tokenVectors) throw new Error('Embedding model returned no token vectors');
        vectors.push(...(mean_pooling(tokenVectors, inputs.attention_mask as Tensor).normalize(2, -1).tolist() as number[][]));
      }
      return vectors;
    });
  }
}
