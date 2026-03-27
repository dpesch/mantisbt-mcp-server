import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Embedder } from '../../src/search/embedder.js';

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers (dynamic import)
// ---------------------------------------------------------------------------

const mockPipelineFn = vi.fn(async (texts: string | string[]) => {
  if (Array.isArray(texts)) {
    return texts.map(() => ({ data: new Float32Array(4).fill(0.1), dims: [1, 4] }));
  }
  return { data: new Float32Array(4).fill(0.1), dims: [4] };
});

const mockPipelineFactory = vi.fn(async (_task: string, _model: string, _opts?: unknown) => mockPipelineFn);

vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipelineFactory,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Thread configuration
// ---------------------------------------------------------------------------

describe('Embedder – thread configuration', () => {
  it('passes intra_op_num_threads=1 by default', async () => {
    const embedder = new Embedder('test-model');
    await embedder.embed('hello');

    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'feature-extraction',
      'test-model',
      expect.objectContaining({
        session_options: { intra_op_num_threads: 1, inter_op_num_threads: 1 },
      }),
    );
  });

  it('passes configured numThreads to intra_op_num_threads; inter stays 1', async () => {
    const embedder = new Embedder('test-model', 4);
    await embedder.embed('hello');

    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'feature-extraction',
      'test-model',
      expect.objectContaining({
        session_options: { intra_op_num_threads: 4, inter_op_num_threads: 1 },
      }),
    );
  });

  it('loads the pipeline only once (lazy singleton)', async () => {
    const embedder = new Embedder('test-model', 1);
    await embedder.embed('first');
    await embedder.embed('second');

    expect(mockPipelineFactory).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Embedder default — numThreads omitted
// ---------------------------------------------------------------------------

describe('Embedder – numThreads default', () => {
  it('uses intra_op_num_threads=1 when numThreads is not passed', async () => {
    const embedder = new Embedder('m');
    await embedder.embed('x');
    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'feature-extraction',
      'm',
      expect.objectContaining({
        session_options: expect.objectContaining({ intra_op_num_threads: 1 }),
      }),
    );
  });
});
