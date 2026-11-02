import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MantisClient } from '../../src/client.js';
import { SearchSyncService, SyncLockedError } from '../../src/search/sync.js';
import { acquireSyncLock } from '../../src/search/sync-lock.js';
import { makeMockStore, makeMockEmbedder, MOCK_SIGNATURE } from '../helpers/search-mocks.js';
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
// Incremental sync against the real API behaviour (regression #8439):
// MantisBT ignores updated_after and always returns all issues, newest first.
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – incremental filtering (API ignores updated_after)', () => {
  const WATERMARK = '2024-03-10T00:00:00Z';

  // Builds `count` issues sorted newest first; the first `newer` of them are
  // newer than WATERMARK, the rest are older.
  function makePage(startId: number, count: number, newer: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: startId + i,
      summary: `Issue ${startId + i}`,
      updated_at: i < newer ? '2024-03-11T00:00:00Z' : '2024-03-01T00:00:00Z',
    }));
  }

  function mockPages(pages: Array<ReturnType<typeof makePage>>, totalCount: number) {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const page = Number(new URL(input as string).searchParams.get('page'));
      return makeResponse(200, JSON.stringify({ issues: pages[page - 1] ?? [], total_count: totalCount }));
    });
  }

  it('embeds only issues updated after the watermark', async () => {
    const store = makeMockStore({ lastSyncedAt: WATERMARK, itemCount: 150 });
    mockPages([makePage(1, 50, 3), makePage(51, 50, 0), makePage(101, 50, 0)], 150);

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    expect(result.indexed).toBe(3);
    const embedded = vi.mocked(store.addBatch).mock.calls.flat(2).map(item => item.id);
    expect(embedded).toEqual([1, 2, 3]);
  });

  it('stops paging after the first page that reaches the watermark', async () => {
    const store = makeMockStore({ lastSyncedAt: WATERMARK, itemCount: 150 });
    mockPages([makePage(1, 50, 50), makePage(51, 50, 10), makePage(101, 50, 0)], 150);

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.indexed).toBe(60);
  });

  it('re-embeds an issue updated exactly at the watermark unless it is already current', async () => {
    // MantisBT timestamps have one-second resolution: an issue changed in the same
    // second as the watermark must not be dropped.
    const store = makeMockStore({
      lastSyncedAt: WATERMARK,
      items: [{ id: 2, updated_at: WATERMARK }],
    });
    mockPages([[
      { id: 1, summary: 'Changed in the watermark second', updated_at: WATERMARK },
      { id: 2, summary: 'Already indexed in this version', updated_at: WATERMARK },
      { id: 3, summary: 'Older', updated_at: '2024-03-01T00:00:00Z' },
    ]], 3);

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    const embedded = vi.mocked(store.addBatch).mock.calls.flat(2).map(item => item.id);
    expect(embedded).toEqual([1]);
    expect(result.indexed).toBe(1);
  });

  it('does not flush when nothing changed', async () => {
    const store = makeMockStore({ lastSyncedAt: WATERMARK, itemCount: 50 });
    mockPages([makePage(1, 50, 0)], 50);

    const service = new SearchSyncService(client, store, embedder);
    const result = await service.sync();

    expect(result.indexed).toBe(0);
    expect(store.flush).not.toHaveBeenCalled();
  });

  it('advances the watermark to the newest updated_at reported by the server', async () => {
    const store = makeMockStore({ lastSyncedAt: WATERMARK, itemCount: 50 });
    mockPages([makePage(1, 50, 3)], 50);

    const service = new SearchSyncService(client, store, embedder);
    await service.sync();

    expect(store.setLastSyncedAt).toHaveBeenCalledWith('2024-03-11T00:00:00Z');
  });

  it('keeps the watermark when no issue is newer', async () => {
    const store = makeMockStore({ lastSyncedAt: WATERMARK, itemCount: 50 });
    mockPages([makePage(1, 50, 0)], 50);

    const service = new SearchSyncService(client, store, embedder);
    await service.sync();

    expect(store.setLastSyncedAt).not.toHaveBeenCalled();
  });

  it('does not move the global watermark for a project-scoped sync', async () => {
    // A project-scoped sync only sees one project; advancing the shared watermark
    // would hide changes in all other projects from the next full sync.
    const store = makeMockStore({ lastSyncedAt: WATERMARK, itemCount: 50 });
    mockPages([makePage(1, 50, 3)], 50);

    const service = new SearchSyncService(client, store, embedder);
    await service.sync(7);

    expect(store.setLastSyncedAt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sync lock: only one process syncs the shared index at a time
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – sync lock', () => {
  let lockDir: string;

  beforeEach(async () => {
    lockDir = await mkdtemp(join(tmpdir(), 'mantis-sync-'));
  });

  afterEach(async () => {
    await rm(lockDir, { recursive: true, force: true });
  });

  it('throws SyncLockedError and does not fetch while another sync holds the lock', async () => {
    const release = await acquireSyncLock(lockDir);
    const store = makeMockStore({ lastSyncedAt: null });

    const service = new SearchSyncService(client, store, embedder, lockDir);
    await expect(service.sync()).rejects.toBeInstanceOf(SyncLockedError);
    expect(fetch).not.toHaveBeenCalled();

    await release!();
  });

  it('releases the lock after the sync, also when it fails', async () => {
    const store = makeMockStore({ lastSyncedAt: null });
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(500, 'boom'));

    const service = new SearchSyncService(client, store, embedder, lockDir);
    await expect(service.sync()).rejects.toThrow();

    expect(await acquireSyncLock(lockDir)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Embedding signature (#8539) — vectors made with another model or token limit
// are not comparable with new query vectors, so the index is rebuilt. An
// incremental sync would never replace them: their issues are unchanged.
// ---------------------------------------------------------------------------

describe('SearchSyncService.sync – embedding signature', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(LIST_ISSUES_RESPONSE)));
  });

  it('rebuilds the index when it was made with another signature', async () => {
    const store = makeMockStore({ lastSyncedAt: '2024-03-01T00:00:00Z', itemCount: 5, embeddingSignature: 'old-model|max_tokens=default' });

    await new SearchSyncService(client, store, embedder).sync();

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(store.resetLastSyncedAt).toHaveBeenCalledTimes(1);
    expect(store.setEmbeddingSignature).toHaveBeenCalledWith(MOCK_SIGNATURE);
  });

  it('rebuilds an index without a signature (written before 1.16.0)', async () => {
    const store = makeMockStore({ lastSyncedAt: '2024-03-01T00:00:00Z', itemCount: 5, embeddingSignature: null });

    await new SearchSyncService(client, store, embedder).sync();

    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(store.setEmbeddingSignature).toHaveBeenCalledWith(MOCK_SIGNATURE);
  });

  it('stores the signature before indexing, so an interrupted rebuild resumes instead of restarting', async () => {
    const store = makeMockStore({ lastSyncedAt: null, embeddingSignature: null });

    await new SearchSyncService(client, store, embedder).sync();

    const signatureAt = vi.mocked(store.setEmbeddingSignature).mock.invocationCallOrder[0]!;
    expect(signatureAt).toBeLessThan(vi.mocked(store.addBatch).mock.invocationCallOrder[0]!);
  });

  it('rebuilds all projects even when the sync is limited to one', async () => {
    const store = makeMockStore({ lastSyncedAt: '2024-03-01T00:00:00Z', itemCount: 5, embeddingSignature: 'old-model|max_tokens=default' });

    await new SearchSyncService(client, store, embedder).sync(7);

    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string);
    expect(url.searchParams.has('project_id')).toBe(false);
  });

  it('limits the first sync of an empty index to the requested project', async () => {
    const store = makeMockStore({ lastSyncedAt: null, itemCount: 0, embeddingSignature: null });

    await new SearchSyncService(client, store, embedder).sync(7);

    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string);
    expect(url.searchParams.get('project_id')).toBe('7');
    expect(store.setEmbeddingSignature).toHaveBeenCalledWith(MOCK_SIGNATURE);
  });

  it('keeps an index made with the current signature', async () => {
    const store = makeMockStore({ lastSyncedAt: '2024-03-01T00:00:00Z', itemCount: 5 });

    await new SearchSyncService(client, store, embedder).sync();

    expect(store.clear).not.toHaveBeenCalled();
    expect(store.setEmbeddingSignature).not.toHaveBeenCalled();
  });

  it('stores the current signature on a requested full rebuild', async () => {
    const store = makeMockStore({ lastSyncedAt: '2024-03-01T00:00:00Z', itemCount: 5 });

    await new SearchSyncService(client, store, embedder).sync(undefined, { full: true });

    expect(store.setEmbeddingSignature).toHaveBeenCalledWith(MOCK_SIGNATURE);
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
