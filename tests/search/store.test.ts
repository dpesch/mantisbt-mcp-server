import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VectraStore } from '../../src/search/store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomVector(dim = 384): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

function tmpDir(): string {
  return join(tmpdir(), `mantis-search-test-${randomBytes(8).toString('hex')}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let store: VectraStore;
let dir: string;

beforeEach(() => {
  dir = tmpDir();
  store = new VectraStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('VectraStore.count', () => {
  it('returns 0 on an empty store', async () => {
    expect(await store.count()).toBe(0);
  });
});

describe('VectraStore.add', () => {
  it('increases count after adding an item', async () => {
    await store.add({ id: 1, vector: randomVector(), metadata: { summary: 'First issue' } });
    expect(await store.count()).toBe(1);
  });

  it('persists across store instances (same dir)', async () => {
    await store.add({ id: 42, vector: randomVector(), metadata: { summary: 'Persistent' } });

    const store2 = new VectraStore(dir);
    expect(await store2.count()).toBe(1);
  });

  it('overwrites an existing item with the same id', async () => {
    const vec1 = randomVector();
    const vec2 = randomVector();
    await store.add({ id: 7, vector: vec1, metadata: { summary: 'Original' } });
    await store.add({ id: 7, vector: vec2, metadata: { summary: 'Updated' } });
    expect(await store.count()).toBe(1);
  });
});

describe('VectraStore.search', () => {
  it('returns results sorted by descending score', async () => {
    const queryVec = randomVector();
    // Add items with known vectors; one is identical to the query (score = 1)
    await store.add({ id: 1, vector: [...queryVec], metadata: { summary: 'Exact match' } });
    await store.add({ id: 2, vector: randomVector(), metadata: { summary: 'Random' } });
    await store.add({ id: 3, vector: randomVector(), metadata: { summary: 'Another random' } });

    const results = await store.search(queryVec, 3);

    expect(results.length).toBe(3);
    expect(results[0]!.id).toBe(1);
    expect(results[0]!.score).toBeCloseTo(1, 5);
    // Scores are descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('respects the topN limit', async () => {
    for (let i = 1; i <= 5; i++) {
      await store.add({ id: i, vector: randomVector(), metadata: { summary: `Issue ${i}` } });
    }
    const results = await store.search(randomVector(), 3);
    expect(results.length).toBe(3);
  });

  it('returns empty array on empty store', async () => {
    const results = await store.search(randomVector(), 5);
    expect(results).toEqual([]);
  });
});

describe('VectraStore.delete', () => {
  it('removes an item and decreases count', async () => {
    await store.add({ id: 10, vector: randomVector(), metadata: { summary: 'To delete' } });
    await store.add({ id: 11, vector: randomVector(), metadata: { summary: 'To keep' } });
    await store.delete(10);
    expect(await store.count()).toBe(1);
  });

  it('does nothing when deleting a non-existent id', async () => {
    await store.add({ id: 5, vector: randomVector(), metadata: { summary: 'Exists' } });
    await store.delete(9999);
    expect(await store.count()).toBe(1);
  });
});

describe('VectraStore.clear', () => {
  it('removes all items', async () => {
    for (let i = 1; i <= 3; i++) {
      await store.add({ id: i, vector: randomVector(), metadata: { summary: `Issue ${i}` } });
    }
    await store.clear();
    expect(await store.count()).toBe(0);
  });
});

describe('VectraStore.getLastSyncedAt / setLastSyncedAt', () => {
  it('returns null initially', async () => {
    expect(await store.getLastSyncedAt()).toBeNull();
  });

  it('returns the value after setting it', async () => {
    const ts = '2024-01-15T10:00:00.000Z';
    await store.setLastSyncedAt(ts);
    expect(await store.getLastSyncedAt()).toBe(ts);
  });

  it('persists the value across instances', async () => {
    const ts = '2024-06-01T12:34:56.000Z';
    await store.setLastSyncedAt(ts);

    const store2 = new VectraStore(dir);
    expect(await store2.getLastSyncedAt()).toBe(ts);
  });
});

describe('VectraStore.resetLastSyncedAt', () => {
  it('clears the lastSyncedAt value', async () => {
    await store.setLastSyncedAt('2024-01-01T00:00:00.000Z');
    await store.resetLastSyncedAt();
    expect(await store.getLastSyncedAt()).toBeNull();
  });
});
