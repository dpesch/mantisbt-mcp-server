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
}

interface TransformersModule {
  pipeline: (task: string, model: string) => Promise<Pipeline>;
}

export class Embedder {
  private pipe: Pipeline | null = null;

  constructor(private readonly modelName: string) {}

  private async load(): Promise<Pipeline> {
    if (this.pipe) return this.pipe;

    process.stderr.write(`[mantisbt-search] Loading embedding model ${this.modelName}...\n`);

    let transformers: TransformersModule;
    try {
      // @ts-expect-error -- optional peer dependency; not present in devDependencies
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      transformers = (await import('@huggingface/transformers')) as TransformersModule;
    } catch {
      throw new Error(
        'Embedding model requires @huggingface/transformers: npm install @huggingface/transformers'
      );
    }

    this.pipe = await transformers.pipeline('feature-extraction', this.modelName);
    return this.pipe;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.load();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return extractVector(output as PipelineOutput);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    if (Array.isArray(output)) {
      return (output as PipelineOutput[]).map(extractVector);
    }
    // Some versions return a single tensor for batch input
    return extractBatchVectors(output as PipelineOutput, texts.length);
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
