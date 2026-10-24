import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Embedder } from '../../src/search/embedder.js';

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers (dynamic import)
// ---------------------------------------------------------------------------

const mockPipelineFn = Object.assign(
  vi.fn(async (texts: string | string[]) => {
    if (Array.isArray(texts)) {
      return texts.map(() => ({ data: new Float32Array(4).fill(0.1), dims: [1, 4] }));
    }
    return { data: new Float32Array(4).fill(0.1), dims: [4] };
  }),
  { dispose: vi.fn(async () => {}) },
);

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

// ---------------------------------------------------------------------------
// Idle unload — every client session runs its own server process, and a loaded
// model costs ~0.9 GB RAM per process, so an idle process releases it.
// ---------------------------------------------------------------------------

describe('Embedder – idle unload', () => {
  const IDLE_MS = 10 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disposes the pipeline after 10 minutes without embedding', async () => {
    const embedder = new Embedder('m');
    await embedder.embed('x');

    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    expect(mockPipelineFn.dispose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mockPipelineFn.dispose).toHaveBeenCalledTimes(1);
  });

  it('reloads the pipeline on the next use after unloading', async () => {
    const embedder = new Embedder('m');
    await embedder.embed('x');
    await vi.advanceTimersByTimeAsync(IDLE_MS);

    await embedder.embed('y');

    expect(mockPipelineFactory).toHaveBeenCalledTimes(2);
  });

  it('restarts the idle time with every use', async () => {
    const embedder = new Embedder('m');
    await embedder.embed('x');
    await vi.advanceTimersByTimeAsync(IDLE_MS - 100);
    await embedder.embedBatch(['y']);
    await vi.advanceTimersByTimeAsync(IDLE_MS - 100);

    expect(mockPipelineFn.dispose).not.toHaveBeenCalled();
    expect(mockPipelineFactory).toHaveBeenCalledTimes(1);
  });

  it('never unloads while an embedding is running', async () => {
    const embedder = new Embedder('m');
    await embedder.embed('warm up');

    let finish!: () => void;
    mockPipelineFn.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { finish = resolve; });
      return { data: new Float32Array(4).fill(0.1), dims: [4] };
    });

    const running = embedder.embed('slow');
    await vi.advanceTimersByTimeAsync(IDLE_MS * 5);
    expect(mockPipelineFn.dispose).not.toHaveBeenCalled();

    finish();
    await running;
    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(mockPipelineFn.dispose).toHaveBeenCalledTimes(1);
  });

  it('loads the pipeline only once for concurrent first calls', async () => {
    const embedder = new Embedder('m');
    await Promise.all([embedder.embed('a'), embedder.embed('b')]);

    expect(mockPipelineFactory).toHaveBeenCalledTimes(1);
  });

  it('keeps a loaded pipeline when a single embedding fails', async () => {
    const embedder = new Embedder('m');
    await embedder.embed('x');
    mockPipelineFn.mockRejectedValueOnce(new Error('bad input'));

    await expect(embedder.embed('broken')).rejects.toThrow('bad input');
    await embedder.embed('y');

    expect(mockPipelineFactory).toHaveBeenCalledTimes(1);
  });

  it('retries loading on the next call after a failed load', async () => {
    const embedder = new Embedder('m');
    mockPipelineFactory.mockRejectedValueOnce(new Error('download failed'));

    await expect(embedder.embed('x')).rejects.toThrow('download failed');
    await embedder.embed('y');

    expect(mockPipelineFactory).toHaveBeenCalledTimes(2);
  });
});
