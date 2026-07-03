import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { SearchSyncService } from '../../src/search/sync.js';
import { makeMockStore, makeMockEmbedder } from '../helpers/search-mocks.js';
import { makeResponse } from '../helpers/mock-server.js';
import type { Embedder } from '../../src/search/embedder.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ISSUE_FIXTURE = [
  { id: 101, summary: 'Login fails on mobile', description: 'Steps to reproduce...', updated_at: '2024-03-10T08:00:00Z' },
  { id: 102, summary: 'Dashboard loads slowly', description: 'Takes over 10 seconds', updated_at: '2024-03-09T14:00:00Z' },
  { id: 103, description: 'No summary here', updated_at: '2024-03-08T10:00:00Z' }, // no summary → skipped
];

const LIST_ISSUES_RESPONSE = {
  issues: ISSUE_FIXTURE,
  total_count: ISSUE_FIXTURE.length,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let client: MantisClient;
let embedder: Embedder;

beforeEach(() => {
  client = new MantisClient('https://mantis.example.com', 'test-token');
  embedder = makeMockEmbedder();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// sync without previous state
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – no previous state', () => {
  it('indexes all issues with summaries and skips those without', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify(LIST_ISSUES_RESPONSE))
    );

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    // 2 issues have summaries, 1 does not
    expect(result.indexed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(store.addBatch).toHaveBeenCalledTimes(1);
    expect(store.setLastSyncedAt).toHaveBeenCalledTimes(1);
  });

  it('calls the API without updated_after when no lastSyncedAt', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify(LIST_ISSUES_RESPONSE))
    );

    const service = new SearchSyncService(client, store, embedder);
    await service.sync();

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.has('updated_after')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sync with lastSyncedAt (incremental)
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – incremental (with lastSyncedAt)', () => {
  it('passes updated_after to the API', async () => {
    const lastSync = '2024-03-09T00:00:00.000Z';
    const store = makeMockStore({ lastSyncedAt: lastSync });
    const incrementalResponse = {
      issues: [ISSUE_FIXTURE[0]!], // only one newer issue
      total_count: 1,
    };
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify(incrementalResponse))
    );

    const service = new SearchSyncService(client, store, embedder);
    await service.sync();

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('updated_after')).toBe(lastSync);
    expect(store.addBatch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Issues without summary are skipped
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – skip issues without summary', () => {
  it('returns correct skipped count', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    const onlyNoSummaryResponse = {
      issues: [{ id: 200, description: 'No summary', updated_at: '2024-01-01T00:00:00Z' }],
      total_count: 1,
    };
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify(onlyNoSummaryResponse))
    );

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    expect(result.indexed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(store.addBatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// project_id is forwarded
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – project_id', () => {
  it('passes project_id to the API', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 0 }))
    );

    const service = new SearchSyncService(client, store, embedder);
    await service.sync(7);

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('project_id')).toBe('7');
  });
});

// ---------------------------------------------------------------------------
// flush / checkpoint behaviour
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – flush and checkpoint', () => {
  function makeIssues(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      summary: `Issue ${i + 1}`,
      description: `Description ${i + 1}`,
      updated_at: '2024-03-10T08:00:00Z',
    }));
  }

  it('calls flush exactly once when fewer than 100 issues are indexed', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: makeIssues(50), total_count: 50 }))
    );

    const service = new SearchSyncService(client, store, embedder);
    await service.sync();

    // Only the final flush, no checkpoint
    expect(store.flush).toHaveBeenCalledTimes(1);
  });

  it('calls flush exactly once when exactly 100 issues are indexed (checkpoint covers all, no redundant final)', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: makeIssues(100), total_count: 100 }))
    );

    const service = new SearchSyncService(client, store, embedder);
    await service.sync();

    // Checkpoint at 100 covers all items; indexedSinceCheckpoint resets to 0 → no redundant final flush
    expect(store.flush).toHaveBeenCalledTimes(1);
  });

  it('calls flush twice when 110 issues are indexed (checkpoint at 100 + final for remaining 10)', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: makeIssues(110), total_count: 110 }))
    );

    const service = new SearchSyncService(client, store, embedder);
    await service.sync();

    // Checkpoint at 100, then final flush for remaining 10
    expect(store.flush).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// total_count persistence (regression: MantisBT installations without total_count)
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – setLastKnownTotal persistence', () => {
  it('persists total_count from API response', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: ISSUE_FIXTURE, total_count: 42 }))
    );

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    expect(store.setLastKnownTotal).toHaveBeenCalledWith(42);
    expect(result.total).toBe(42);
  });

  it('uses indexed+skipped as fallback when API omits total_count (full rebuild)', async () => {
    // Regression test: MantisBT installations that do not return total_count
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: ISSUE_FIXTURE })) // no total_count field
    );

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    // ISSUE_FIXTURE: 2 indexed (have summary), 1 skipped (no summary) → total = 3
    expect(result.total).toBe(3);
    expect(store.setLastKnownTotal).toHaveBeenCalledWith(3);
  });

  it('falls back to store.count() for incremental sync when API omits total_count', async () => {
    // MantisBT installations without total_count: incremental sync uses the current store
    // size as best available estimate so the status tool never shows "total unknown".
    const store = makeMockStore({ lastSyncedAt: '2024-03-01T00:00:00.000Z', itemCount: 100 });
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [ISSUE_FIXTURE[0]!] })) // no total_count, partial result
    );

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    // store.count() returns 101 after adding the 1 new item (mock increments count on addBatch)
    expect(result.total).toBeGreaterThan(0);
    expect(store.setLastKnownTotal).toHaveBeenCalled();
  });
});
