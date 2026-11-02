import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Tensor } from '@huggingface/transformers';
import { Embedder } from '../../src/search/embedder.js';

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers (dynamic import)
//
// Only pipeline() is replaced. Tensor and mean_pooling stay real, so the
// pooling and normalisation tested here are the library's own.
// ---------------------------------------------------------------------------

// Token vectors per text: [batch=2][seq=2][dim=2]. The second token of the
// second text is padding (mask 0) and must not count towards the mean.
const HIDDEN = [[[3, 0], [1, 0]], [[0, 4], [9, 9]]];
const MASK = [[1, 1], [1, 0]];

function fakeTokenizerOutput(count: number) {
  return {
    attention_mask: new Tensor('int64', BigInt64Array.from(MASK.slice(0, count).flat().map(BigInt)), [count, 2]),
  };
}

const mockTokenizer = vi.fn((texts: string[], _opts?: unknown) => fakeTokenizerOutput(texts.length));
const modelImpl = async (inputs: { attention_mask: Tensor }) => {
  const count = inputs.attention_mask.dims[0]!;
  return { last_hidden_state: new Tensor('float32', Float32Array.from(HIDDEN.slice(0, count).flat(2)), [count, 2, 2]) };
};
const mockModel = vi.fn(modelImpl);

const mockPipelineFn = { tokenizer: mockTokenizer, model: mockModel, dispose: vi.fn(async () => {}) };

const mockPipelineFactory = vi.fn(async (_task: string, _model: string, _opts?: unknown) => mockPipelineFn);

vi.mock('@huggingface/transformers', async importOriginal => ({
  ...(await importOriginal<typeof import('@huggingface/transformers')>()),
  // Lazy: the static Tensor import evaluates this factory before the mocks exist.
  pipeline: (...args: Parameters<typeof mockPipelineFactory>) => mockPipelineFactory(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const DEFAULT_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// ---------------------------------------------------------------------------
// Embedding output
// ---------------------------------------------------------------------------

describe('Embedder – embedding output', () => {
  it('returns one mean-pooled, L2-normalised vector per text, ignoring padding', async () => {
    const vectors = await new Embedder('m').embedBatch(['a', 'b']);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]![0]).toBeCloseTo(1);
    expect(vectors[0]![1]).toBeCloseTo(0);
    expect(vectors[1]![0]).toBeCloseTo(0);
    expect(vectors[1]![1]).toBeCloseTo(1);
  });

  it('embed() returns the vector of a single text', async () => {
    const vector = await new Embedder('m').embed('a');

    expect(vector[0]).toBeCloseTo(1);
    expect(vector[1]).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// Token limit (#8539) — the default model is trained on 128 tokens. Longer
// input is out of distribution and makes the vectors of long issues collapse
// into one another.
// ---------------------------------------------------------------------------

describe('Embedder – token limit', () => {
  it('truncates the default model to its training length of 128 tokens', async () => {
    await new Embedder(DEFAULT_MODEL).embedBatch(['a']);

    expect(mockTokenizer).toHaveBeenCalledWith(['a'], expect.objectContaining({
      padding: true, truncation: true, max_length: 128,
    }));
  });

  it('applies the same limit to search queries', async () => {
    await new Embedder(DEFAULT_MODEL).embed('a');

    expect(mockTokenizer).toHaveBeenCalledWith(['a'], expect.objectContaining({ max_length: 128 }));
  });

  it('keeps the tokenizer limit for models without a known training length', async () => {
    await new Embedder('some/other-model').embed('a');

    expect(mockTokenizer).toHaveBeenCalledWith(['a'], expect.objectContaining({ truncation: true, max_length: undefined }));
  });
});

// ---------------------------------------------------------------------------
// Signature — identifies how the stored vectors were made, so a changed model
// or token limit triggers a rebuild of the index.
// ---------------------------------------------------------------------------

describe('Embedder – signature', () => {
  it('names the model and its token limit', () => {
    expect(new Embedder(DEFAULT_MODEL).signature).toBe(`${DEFAULT_MODEL}|max_tokens=128`);
  });

  it('marks the tokenizer limit for models without a known training length', () => {
    expect(new Embedder('some/other-model').signature).toBe('some/other-model|max_tokens=default');
  });
});

// ---------------------------------------------------------------------------
// Thread configuration
// ---------------------------------------------------------------------------

describe('Embedder – thread configuration', () => {
  it('passes intraOpNumThreads=1 by default', async () => {
    const embedder = new Embedder('test-model');
    await embedder.embed('hello');

    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'feature-extraction',
      'test-model',
      expect.objectContaining({
        session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
      }),
    );
  });

  it('passes configured numThreads to intraOpNumThreads; interOpNumThreads stays 1', async () => {
    const embedder = new Embedder('test-model', 4);
    await embedder.embed('hello');

    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'feature-extraction',
      'test-model',
      expect.objectContaining({
        session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
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
  it('uses intraOpNumThreads=1 when numThreads is not passed', async () => {
    const embedder = new Embedder('m');
    await embedder.embed('x');
    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'feature-extraction',
      'm',
      expect.objectContaining({
        session_options: expect.objectContaining({ intraOpNumThreads: 1 }),
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
    mockModel.mockImplementationOnce(async inputs => {
      await new Promise<void>(resolve => { finish = resolve; });
      return modelImpl(inputs);
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
    mockModel.mockRejectedValueOnce(new Error('bad input'));

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
