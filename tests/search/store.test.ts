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

  it('scores an issue by the best of its vector and its chunk vectors', async () => {
    const queryVec = randomVector();
    await store.add({ id: 1, vector: randomVector(), chunks: [randomVector(), [...queryVec]], metadata: { summary: 'Match in a chunk' } });
    await store.add({ id: 2, vector: randomVector(), metadata: { summary: 'Random' } });

    const results = await store.search(queryVec, 2);

    expect(results[0]!.id).toBe(1);
    expect(results[0]!.score).toBeCloseTo(1, 5);
  });

  // Hybrid search (#8542): with the query text, the ranking fuses vector and
  // keyword ranks; the score stays the vector similarity.
  it('ranks an exact keyword match first when the query text is given', async () => {
    const queryVec = randomVector();
    await store.add({ id: 1, vector: [...queryVec], metadata: { summary: 'Similar wording', description: 'nothing special' } });
    await store.add({ id: 2, vector: randomVector(), metadata: { summary: 'Other', description: 'set MANTIS_SEARCH_DIR here' } });
    await store.add({ id: 3, vector: randomVector(), metadata: { summary: 'Third', description: 'unrelated' } });

    const results = await store.search(queryVec, 3, 'MANTIS_SEARCH_DIR');

    expect(results[0]!.id).toBe(2);
    expect(results.find(r => r.id === 1)!.score).toBeCloseTo(1, 5);
  });

  // Exact-first (#8545): issues containing an identifier from the query rank
  // before all others, whatever their vector similarity.
  it('ranks every issue containing a query identifier before the others', async () => {
    // The pattern from the ticket: a short issue without the number is the
    // nearest vector, the issues with the number are far away. Plain RRF puts
    // the short issue between the keyword ranks 1 and 2.
    const queryVec = randomVector();
    const far = queryVec.map(x => -x);
    await store.add({ id: 1, vector: [...queryVec], metadata: { summary: 'Short ticket', description: 'see e-mail' } });
    for (let id = 2; id <= 4; id++) {
      await store.add({ id, vector: [...far], metadata: { summary: `Order ${id}`, description: `Auftrag 202699999 Position ${id}` } });
    }
    await store.addBatch(Array.from({ length: 200 }, (_, k) => (
      { id: 100 + k, vector: randomVector(), metadata: { summary: `Filler ${k}`, description: 'Auftrag 202699998' } }
    )));

    const results = await store.search(queryVec, 5, '202699999');

    expect(results.slice(0, 3).map(r => r.id).sort()).toEqual([2, 3, 4]);
  });

  it('keeps the fused ranking for queries without identifiers', async () => {
    const queryVec = randomVector();
    await store.add({ id: 1, vector: [...queryVec], metadata: { summary: 'Statusleiste Farbe veraltet' } });
    await store.add({ id: 2, vector: randomVector(), metadata: { summary: 'Android 15', description: 'API 15' } });

    const results = await store.search(queryVec, 2, 'Statusleiste Farbe veraltete API Android 15');

    expect(results[0]!.id).toBe(1);
  });

  it('ranks by vector similarity alone without query text', async () => {
    const queryVec = randomVector();
    await store.add({ id: 1, vector: [...queryVec], metadata: { summary: 'Similar wording' } });
    await store.add({ id: 2, vector: randomVector(), metadata: { summary: 'MANTIS_SEARCH_DIR' } });

    const results = await store.search(queryVec, 2);

    expect(results[0]!.id).toBe(1);
  });

  it('finds keywords of items added after an earlier search', async () => {
    await store.add({ id: 1, vector: randomVector(), metadata: { summary: 'First' } });
    await store.search(randomVector(), 1, 'first');
    await store.add({ id: 2, vector: randomVector(), metadata: { summary: 'Second', description: 'zebra' } });

    const results = await store.search(randomVector(), 1, 'zebra');

    expect(results[0]!.id).toBe(2);
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

  // #8626: the sync removes all stale issues in one call.
  it('removes several items at once and lists the remaining ids', async () => {
    for (const id of [1, 2, 3]) await store.add({ id, vector: randomVector(), metadata: { summary: `Issue ${id}` } });

    await store.delete(1, 3);

    expect(await store.ids()).toEqual([2]);
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

describe('VectraStore.getEmbeddingSignature / setEmbeddingSignature', () => {
  it('returns null for an index without a signature', async () => {
    expect(await store.getEmbeddingSignature()).toBeNull();
  });

  it('persists the signature across instances', async () => {
    await store.setEmbeddingSignature('model-a|max_tokens=128');

    expect(await new VectraStore(dir).getEmbeddingSignature()).toBe('model-a|max_tokens=128');
  });
});

describe('VectraStore.resetLastSyncedAt', () => {
  it('clears the lastSyncedAt value', async () => {
    await store.setLastSyncedAt('2024-01-01T00:00:00.000Z');
    await store.resetLastSyncedAt();
    expect(await store.getLastSyncedAt()).toBeNull();
  });
});

describe('VectraStore.addBatch', () => {
  it('increases in-memory count without persisting to disk', async () => {
    await store.addBatch([
      { id: 1, vector: randomVector(), metadata: { summary: 'A' } },
      { id: 2, vector: randomVector(), metadata: { summary: 'B' } },
    ]);
    expect(await store.count()).toBe(2);

    // A new instance reading the same dir must not see the items yet
    const store2 = new VectraStore(dir);
    expect(await store2.count()).toBe(0);
  });

  it('persists items after flush()', async () => {
    await store.addBatch([
      { id: 10, vector: randomVector(), metadata: { summary: 'X' } },
      { id: 11, vector: randomVector(), metadata: { summary: 'Y' } },
    ]);
    await store.flush();

    const store2 = new VectraStore(dir);
    expect(await store2.count()).toBe(2);
  });

  it('accumulates items across multiple addBatch calls before flush', async () => {
    await store.addBatch([{ id: 1, vector: randomVector(), metadata: { summary: 'First' } }]);
    await store.addBatch([{ id: 2, vector: randomVector(), metadata: { summary: 'Second' } }]);
    await store.flush();

    const store2 = new VectraStore(dir);
    expect(await store2.count()).toBe(2);
  });
});

describe('VectraStore.flush (atomic write)', () => {
  it('leaves no .tmp file after a successful flush', async () => {
    const { readdir } = await import('node:fs/promises');
    await store.addBatch([{ id: 1, vector: randomVector(), metadata: { summary: 'Test' } }]);
    await store.flush();

    const files = await readdir(join(dir, 'vectra'));
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });
});

describe('VectraStore – index written by another process', () => {
  // Every client session runs its own server process on the same index. A
  // process that loaded the index earlier must pick up what another process
  // synced since, or its next flush would write the old state back.
  it('reloads the index when index.json changed on disk', async () => {
    await store.count(); // load the (empty) index into memory

    const other = new VectraStore(dir);
    await other.add({ id: 7, vector: randomVector(), metadata: { summary: 'Synced elsewhere' } });

    expect(await store.getItem(7)).not.toBeNull();
    expect(await store.count()).toBe(1);
  });

  it('keeps the other process\'s items when flushing its own', async () => {
    await store.count();

    const other = new VectraStore(dir);
    await other.add({ id: 7, vector: randomVector(), metadata: { summary: 'Synced elsewhere' } });

    await store.addBatch([{ id: 8, vector: randomVector(), metadata: { summary: 'Mine' } }]);
    await store.flush();

    const fresh = new VectraStore(dir);
    expect(await fresh.count()).toBe(2);
  });
});
