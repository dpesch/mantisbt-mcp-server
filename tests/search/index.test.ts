import { describe, it, expect, vi } from 'vitest';
import type { VectorStore } from '../../src/search/store.js';
import { initializeSearchModule } from '../../src/search/index.js';
import { makeMockStore } from '../helpers/search-mocks.js';

// ---------------------------------------------------------------------------
// initializeSearchModule — startup work before server.connect() (#8517)
// The store, embedder and sync service are mocked: only the startup decision
// whether to load the whole index (store.count()) is under test.
// ---------------------------------------------------------------------------

let store: VectorStore;

vi.mock('../../src/search/store.js', () => ({ createVectorStore: () => store }));
vi.mock('../../src/search/embedder.js', () => ({ Embedder: class {} }));
vi.mock('../../src/search/tools.js', () => ({ registerSearchTools: vi.fn(), getSearchIndexStatus: vi.fn() }));
vi.mock('../../src/search/sync.js', () => ({
  SearchSyncService: class { sync = vi.fn(async () => {}); },
  SyncLockedError: class extends Error {},
}));

const CONFIG = { enabled: true, backend: 'vectra' as const, dir: '/tmp/search', modelName: 'm', numThreads: 1 };
const init = () => initializeSearchModule({} as never, {} as never, CONFIG);

describe('initializeSearchModule – startup index load', () => {
  it('does not load the index when last_total.txt already holds a total', async () => {
    store = makeMockStore({ itemCount: 7904, lastKnownTotal: 7904 });

    await init();

    expect(store.count).not.toHaveBeenCalled();
    expect(store.setLastKnownTotal).not.toHaveBeenCalled();
  });

  it('seeds last_total from the index size when it is missing', async () => {
    store = makeMockStore({ itemCount: 42, lastKnownTotal: null });

    await init();

    expect(store.count).toHaveBeenCalledOnce();
    expect(store.setLastKnownTotal).toHaveBeenCalledWith(42);
  });

  it('leaves last_total unset when the index is empty', async () => {
    store = makeMockStore({ itemCount: 0, lastKnownTotal: null });

    await init();

    expect(store.setLastKnownTotal).not.toHaveBeenCalled();
  });
});
