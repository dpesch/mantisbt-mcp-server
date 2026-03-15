import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock must be at module top level — vitest hoists it automatically
vi.mock('node:fs/promises');

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { MetadataCache, type CachedMetadata } from '../src/cache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_DIR = '/tmp/test-cache';
const TTL = 3600; // 1 hour in seconds

function makeCache(): MetadataCache {
  return new MetadataCache(CACHE_DIR, TTL);
}

function makeSampleMetadata(): CachedMetadata {
  return {
    timestamp: Date.now(),
    projects: [{ id: 1, name: 'Test Project' }],
    byProject: {},
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// isValid()
// ---------------------------------------------------------------------------

describe('MetadataCache – isValid()', () => {
  it('returns false when file does not exist (readFile throws)', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const cache = makeCache();
    await expect(cache.isValid()).resolves.toBe(false);
  });

  it('returns true when file is fresh (within TTL)', async () => {
    const file = { timestamp: Date.now(), data: makeSampleMetadata() };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(file) as any);

    const cache = makeCache();
    await expect(cache.isValid()).resolves.toBe(true);
  });

  it('returns false when file has expired (timestamp older than TTL)', async () => {
    const expiredTimestamp = Date.now() - (TTL + 1) * 1000;
    const file = { timestamp: expiredTimestamp, data: makeSampleMetadata() };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(file) as any);

    const cache = makeCache();
    await expect(cache.isValid()).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// load()
// ---------------------------------------------------------------------------

describe('MetadataCache – load()', () => {
  it('returns null when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const cache = makeCache();
    await expect(cache.load()).resolves.toBeNull();
  });

  it('returns CachedMetadata when file exists', async () => {
    const metadata = makeSampleMetadata();
    const file = { timestamp: Date.now(), data: metadata };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(file) as any);

    const cache = makeCache();
    const result = await cache.load();
    expect(result).toEqual(metadata);
  });
});

// ---------------------------------------------------------------------------
// save()
// ---------------------------------------------------------------------------

describe('MetadataCache – save()', () => {
  it('calls mkdir with recursive:true and writeFile with JSON content', async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const cache = makeCache();
    const metadata = makeSampleMetadata();
    await cache.save(metadata);

    expect(mkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
    expect(writeFile).toHaveBeenCalledOnce();

    // Verify the written JSON contains our data
    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent) as { timestamp: number; data: CachedMetadata };
    expect(parsed.data).toEqual(metadata);
  });

  it('writes a timestamp to the cache file', async () => {
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const before = Date.now();
    const cache = makeCache();
    await cache.save(makeSampleMetadata());
    const after = Date.now();

    const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent) as { timestamp: number };
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
    expect(parsed.timestamp).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// invalidate()
// ---------------------------------------------------------------------------

describe('MetadataCache – invalidate()', () => {
  it('calls unlink on the cache file', async () => {
    vi.mocked(unlink).mockResolvedValue(undefined);

    const cache = makeCache();
    await cache.invalidate();

    expect(unlink).toHaveBeenCalledOnce();
    const calledPath = vi.mocked(unlink).mock.calls[0][0] as string;
    expect(calledPath).toContain('metadata.json');
  });

  it('does not throw when file does not exist (unlink rejects)', async () => {
    vi.mocked(unlink).mockRejectedValue(new Error('ENOENT'));

    const cache = makeCache();
    await expect(cache.invalidate()).resolves.toBeUndefined();
  });
});
