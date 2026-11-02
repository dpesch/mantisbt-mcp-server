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
    this.signature = `${modelName}|max_tokens=${this.maxTokens ?? 'default'}`;
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

    // FIXME: onnxruntime expects intraOpNumThreads/interOpNumThreads and
    // silently ignores these snake_case keys, so the thread limit has no
    // effect. Kept as is here; fixing it changes sync speed noticeably.
    return transformers.pipeline('feature-extraction', this.modelName, {
      session_options: {
        intra_op_num_threads: this.numThreads,
        inter_op_num_threads: 1, // Transformer graphs are sequential — no benefit from inter-op parallelism
      } as Record<string, number>,
    });
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0]!;
  }

  // Same steps as the feature-extraction pipeline with pooling 'mean' and
  // normalize — but the pipeline offers no way to pass max_length.
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.withPipeline(async ({ tokenizer, model }) => {
      const inputs = tokenizer(texts, { padding: true, truncation: true, max_length: this.maxTokens });
      const outputs = (await model(inputs)) as Record<string, Tensor | undefined>;
      const tokenVectors = outputs['last_hidden_state'] ?? outputs['logits'] ?? outputs['token_embeddings'];
      if (!tokenVectors) throw new Error('Embedding model returned no token vectors');
      // Already loaded by load(), so this resolves from the module cache.
      const { mean_pooling } = await import('@huggingface/transformers');
      return mean_pooling(tokenVectors, inputs.attention_mask as Tensor).normalize(2, -1).tolist() as number[][];
    });
  }
}
