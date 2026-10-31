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

export interface MockStoreItem {
  id: number;
  score?: number;
  updated_at?: string;
}

export function makeMockStore(options?: {
  lastSyncedAt?: string | null;
  itemCount?: number;
  lastKnownTotal?: number | null;
  items?: MockStoreItem[];
}): VectorStore {
  const lastSyncedAt = options?.lastSyncedAt ?? null;
  const seedItems = options?.items ?? null;
  const addedItems: VectorStoreItem[] = [];
  const itemMap = new Map<number, VectorStoreItem>(
    (seedItems ?? []).map(i => [i.id, {
      id: i.id,
      vector: MOCK_VECTOR,
      metadata: { summary: `Issue ${i.id}`, updated_at: i.updated_at },
    }])
  );
  let count = options?.itemCount ?? seedItems?.length ?? 0;

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
    search: vi.fn(async (_vec: number[], topN: number) => {
      if (seedItems) {
        return seedItems.slice(0, topN).map(i => ({ id: i.id, score: i.score ?? 0.9 }));
      }
      return Array.from({ length: Math.min(topN, count) }, (_, i) => ({
        id: i + 1,
        score: 1 - i * 0.1,
      }));
    }),
    getItem: vi.fn(async (id: number) => itemMap.get(id) ?? null),
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
    flush: vi.fn(async () => {}),
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
