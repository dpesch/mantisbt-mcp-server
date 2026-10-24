// ---------------------------------------------------------------------------
// Embedder
// Wraps @huggingface/transformers for local ONNX-based embeddings.
// Lazy-loaded on first use — no model download at server startup.
//
// @huggingface/transformers is an optional dependency. The import is
// guarded with a try/catch so the server starts without it.
// ---------------------------------------------------------------------------

interface PipelineOutput {
  data: Float32Array | number[];
  dims: number[];
}

interface Pipeline {
  (text: string | string[], options?: Record<string, unknown>): Promise<PipelineOutput | PipelineOutput[]>;
  dispose?: () => Promise<void>;
}

interface PipelineOptions {
  session_options?: {
    intra_op_num_threads?: number;
    inter_op_num_threads?: number;
  };
}

interface TransformersModule {
  pipeline: (task: string, model: string, options?: PipelineOptions) => Promise<Pipeline>;
}

// A loaded model takes ~0.9 GB RAM, and every client session runs its own
// server process. An idle process releases the model; the next use reloads it.
const IDLE_UNLOAD_MS = 10 * 60 * 1000;

export class Embedder {
  private pipe: Promise<Pipeline> | null = null;
  private running = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly modelName: string,
    private readonly numThreads: number = 1,
  ) {}

  private async withPipeline<T>(fn: (extractor: Pipeline) => Promise<T>): Promise<T> {
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

  private async load(): Promise<Pipeline> {
    process.stderr.write(`[mantisbt-search] Loading embedding model ${this.modelName} (threads: ${this.numThreads})...\n`);

    let transformers: TransformersModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      transformers = (await import('@huggingface/transformers')) as TransformersModule;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load @huggingface/transformers: ${msg}`);
    }

    return transformers.pipeline('feature-extraction', this.modelName, {
      session_options: {
        intra_op_num_threads: this.numThreads,
        inter_op_num_threads: 1, // Transformer graphs are sequential — no benefit from inter-op parallelism
      },
    });
  }

  async embed(text: string): Promise<number[]> {
    return this.withPipeline(async extractor => {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return extractVector(output as PipelineOutput);
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.withPipeline(async extractor => {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      if (Array.isArray(output)) {
        return (output as PipelineOutput[]).map(extractVector);
      }
      // Some versions return a single tensor for batch input
      return extractBatchVectors(output as PipelineOutput, texts.length);
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractVector(output: PipelineOutput): number[] {
  const data = output.data;
  return Array.from(data as Float32Array);
}

function extractBatchVectors(output: PipelineOutput, batchSize: number): number[][] {
  const data = Array.from(output.data as Float32Array);
  // dims is typically [batchSize, sequenceLen, hiddenSize] or [batchSize, hiddenSize]
  const vecSize = data.length / batchSize;
  if (!Number.isInteger(vecSize)) {
    throw new Error(`Unexpected batch output shape: ${data.length} elements for batch size ${batchSize}`);
  }
  const result: number[][] = [];
  for (let i = 0; i < batchSize; i++) {
    result.push(data.slice(i * vecSize, (i + 1) * vecSize));
  }
  return result;
}
