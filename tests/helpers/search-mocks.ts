import { vi } from 'vitest';
import type { VectorStore, VectorStoreItem } from '../../src/search/store.js';
import type { Embedder } from '../../src/search/embedder.js';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const MOCK_VECTOR = Array(384).fill(0.1) as number[];

// ---------------------------------------------------------------------------
// makeMockStore
// ---------------------------------------------------------------------------

export function makeMockStore(options?: { lastSyncedAt?: string | null; itemCount?: number; lastKnownTotal?: number | null }): VectorStore {
  const lastSyncedAt = options?.lastSyncedAt ?? null;
  const addedItems: VectorStoreItem[] = [];
  let count = options?.itemCount ?? 0;

  return {
    add: vi.fn(async (item: VectorStoreItem) => {
      addedItems.push(item);
      count++;
    }),
    addBatch: vi.fn(async (items: VectorStoreItem[]) => {
      for (const item of items) {
        addedItems.push(item);
      }
      count += items.length;
    }),
    search: vi.fn(async (_vec: number[], topN: number) =>
      Array.from({ length: Math.min(topN, count) }, (_, i) => ({
        id: i + 1,
        score: 1 - i * 0.1,
      }))
    ),
    delete: vi.fn(async () => {}),
    count: vi.fn(async () => count),
    clear: vi.fn(async () => {
      addedItems.splice(0);
      count = 0;
    }),
    getLastSyncedAt: vi.fn(async () => lastSyncedAt),
    setLastSyncedAt: vi.fn(async () => {}),
    resetLastSyncedAt: vi.fn(async () => {}),
    getLastKnownTotal: vi.fn(async () => options?.lastKnownTotal ?? null),
    setLastKnownTotal: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// makeMockEmbedder
// ---------------------------------------------------------------------------

export function makeMockEmbedder(): Embedder {
  return {
    embed: vi.fn(async () => MOCK_VECTOR),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(() => MOCK_VECTOR)),
  } as unknown as Embedder;
}
