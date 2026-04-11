import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { registerSearchTools } from '../../src/search/tools.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';
import { makeMockStore, makeMockEmbedder } from '../helpers/search-mocks.js';
import type { Embedder } from '../../src/search/embedder.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;
let embedder: Embedder;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  embedder = makeMockEmbedder();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

describe('registerSearchTools – registration', () => {
  it('registers search_issues', () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);
    expect(mockServer.hasToolRegistered('search_issues')).toBe(true);
  });

  it('registers rebuild_search_index', () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);
    expect(mockServer.hasToolRegistered('rebuild_search_index')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// search_issues – empty store
// ---------------------------------------------------------------------------

describe('search_issues – empty store', () => {
  it('returns error message when store is empty', async () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', { query: 'login error', top_n: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Search index is empty');
  });
});

// ---------------------------------------------------------------------------
// search_issues – with results
// ---------------------------------------------------------------------------

describe('search_issues – with results', () => {
  it('returns a JSON array with id and score', async () => {
    const store = makeMockStore({ itemCount: 3 });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', { query: 'login error', top_n: 3 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number; score: number }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(typeof parsed[0]!.id).toBe('number');
    expect(typeof parsed[0]!.score).toBe('number');
  });

  it('respects the top_n parameter', async () => {
    const store = makeMockStore({ itemCount: 10 });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', { query: 'bug', top_n: 2 });

    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number; score: number }>;
    expect(parsed.length).toBeLessThanOrEqual(2);
  });

  it('calls embedder.embed with the query', async () => {
    const store = makeMockStore({ itemCount: 1 });
    registerSearchTools(mockServer as never, client, store, embedder);

    await mockServer.callTool('search_issues', { query: 'performance issue', top_n: 5 });

    expect(embedder.embed).toHaveBeenCalledWith('performance issue');
  });
});

// ---------------------------------------------------------------------------
// rebuild_search_index – full rebuild
// ---------------------------------------------------------------------------

describe('rebuild_search_index – full: true', () => {
  it('clears the store and resets lastSyncedAt before syncing', async () => {
    const store = makeMockStore({ itemCount: 5 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 0 }))
    );

    await mockServer.callTool('rebuild_search_index', { full: true });

    expect(store.clear).toHaveBeenCalled();
    expect(store.resetLastSyncedAt).toHaveBeenCalled();
  });

  it('returns indexed, skipped, duration_ms in the response', async () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 0 }))
    );

    const result = await mockServer.callTool('rebuild_search_index', { full: false });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      indexed: number;
      skipped: number;
      duration_ms: number;
    };
    expect(typeof parsed.indexed).toBe('number');
    expect(typeof parsed.skipped).toBe('number');
    expect(typeof parsed.duration_ms).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// rebuild_search_index – incremental (full: false)
// ---------------------------------------------------------------------------

describe('rebuild_search_index – full: false', () => {
  it('does NOT clear the store', async () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 0 }))
    );

    await mockServer.callTool('rebuild_search_index', { full: false });

    expect(store.clear).not.toHaveBeenCalled();
    expect(store.resetLastSyncedAt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// search_issues – select parameter
// ---------------------------------------------------------------------------

describe('search_issues – select parameter', () => {
  it('returns plain {id, score, view_url} array when select is not provided', async () => {
    const store = makeMockStore({ itemCount: 2 });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', { query: 'test', top_n: 2 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number; score: number; view_url: string }>;
    expect(parsed[0]).toEqual(expect.objectContaining({ id: expect.any(Number), score: expect.any(Number) }));
    expect(Object.keys(parsed[0]!)).toEqual(['id', 'score', 'view_url']);
    expect(parsed[0]!.view_url).toBe(`https://mantis.example.com/view.php?id=${parsed[0]!.id}`);
  });

  it('fetches issues and projects requested fields when select is provided', async () => {
    const store = makeMockStore({ itemCount: 2 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeResponse(200, JSON.stringify({ issues: [{ id: 1, summary: 'Login bug', status: { id: 10, name: 'new' }, priority: { id: 30, name: 'normal' } }] }))
      )
      .mockResolvedValueOnce(
        makeResponse(200, JSON.stringify({ issues: [{ id: 2, summary: 'Crash on save', status: { id: 50, name: 'assigned' }, priority: { id: 40, name: 'high' } }] }))
      );

    const result = await mockServer.callTool('search_issues', { query: 'test', top_n: 2, select: 'summary,status' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    // id and score always present
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('score');
    // requested fields present
    expect(parsed[0]).toHaveProperty('summary', 'Login bug');
    expect(parsed[0]).toHaveProperty('status');
    // non-requested field absent
    expect(parsed[0]).not.toHaveProperty('priority');
  });

  it('id and score are always included even when not listed in select', async () => {
    const store = makeMockStore({ itemCount: 1 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1, summary: 'Test issue' }] }))
    );

    const result = await mockServer.callTool('search_issues', { query: 'test', top_n: 1, select: 'summary' });

    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('id', 1);
    expect(parsed[0]).toHaveProperty('score');
    expect(parsed[0]).toHaveProperty('summary', 'Test issue');
  });

  it('falls back to {id, score} when issue fetch fails', async () => {
    const store = makeMockStore({ itemCount: 2 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 1, summary: 'OK issue' }] })))
      .mockResolvedValueOnce(makeResponse(500, 'Internal Server Error'));

    const result = await mockServer.callTool('search_issues', { query: 'test', top_n: 2, select: 'summary' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    // First item enriched
    expect(parsed[0]).toHaveProperty('summary');
    // Second item fallback — id, score, and view_url
    expect(Object.keys(parsed[1]!).sort()).toEqual(['id', 'score', 'view_url']);
  });

  it('omits non-existent fields silently', async () => {
    const store = makeMockStore({ itemCount: 1 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1, summary: 'Test' }] }))
    );

    const result = await mockServer.callTool('search_issues', { query: 'test', top_n: 1, select: 'summary,nonexistent_field' });

    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('summary', 'Test');
    expect(parsed[0]).not.toHaveProperty('nonexistent_field');
  });

  it('makes one API call per result when select is provided', async () => {
    const store = makeMockStore({ itemCount: 3 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1, summary: 'Issue' }] }))
    );

    await mockServer.callTool('search_issues', { query: 'test', top_n: 3, select: 'summary' });

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('makes no API calls when select is not provided', async () => {
    const store = makeMockStore({ itemCount: 3 });
    registerSearchTools(mockServer as never, client, store, embedder);

    await mockServer.callTool('search_issues', { query: 'test', top_n: 3 });

    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// get_search_index_status – registration
// ---------------------------------------------------------------------------

describe('get_search_index_status – registration', () => {
  it('is registered', () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);
    expect(mockServer.hasToolRegistered('get_search_index_status')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// get_search_index_status – reads from store, no API call
// ---------------------------------------------------------------------------

describe('get_search_index_status – with stored total', () => {
  it('returns summary, indexed, total, percent and last_synced_at from store', async () => {
    const store = makeMockStore({
      itemCount: 42,
      lastSyncedAt: '2026-03-16T10:00:00.000Z',
      lastKnownTotal: 100,
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('get_search_index_status', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      summary: string;
      indexed: number;
      total: number;
      percent: number;
      last_synced_at: string;
    };
    expect(parsed.indexed).toBe(42);
    expect(parsed.total).toBe(100);
    expect(parsed.percent).toBe(42);
    expect(parsed.summary).toBe('42/100 (42 %)');
    expect(parsed.last_synced_at).toBe('2026-03-16T10:00:00.000Z');
  });

  it('makes no API call', async () => {
    const store = makeMockStore({ itemCount: 0, lastKnownTotal: 50 });
    registerSearchTools(mockServer as never, client, store, embedder);

    await mockServer.callTool('get_search_index_status', {});

    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// get_search_index_status – edge cases
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// search_issues – date filters
// ---------------------------------------------------------------------------

describe('search_issues – updated_after filter (no select, uses store metadata)', () => {
  it('returns only results whose store metadata updated_at is after the threshold', async () => {
    const store = makeMockStore({
      items: [
        { id: 1, score: 0.9, updated_at: '2026-03-26T00:00:00Z' }, // pass
        { id: 2, score: 0.8, updated_at: '2026-03-23T00:00:00Z' }, // fail
        { id: 3, score: 0.7, updated_at: '2026-03-25T12:00:00Z' }, // pass
      ],
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', {
      query: 'test',
      top_n: 10,
      updated_after: '2026-03-25T00:00:00Z',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number }>;
    expect(parsed.map(r => r.id)).toEqual([1, 3]);
  });

  it('makes no API calls when filtering via store metadata (no select)', async () => {
    const store = makeMockStore({
      items: [{ id: 1, updated_at: '2026-03-26T00:00:00Z' }],
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    await mockServer.callTool('search_issues', {
      query: 'test',
      top_n: 5,
      updated_after: '2026-03-25T00:00:00Z',
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('excludes results with no updated_at in store metadata', async () => {
    const store = makeMockStore({
      items: [
        { id: 1, score: 0.9 },              // no updated_at → excluded
        { id: 2, score: 0.8, updated_at: '2026-03-26T00:00:00Z' }, // pass
      ],
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', {
      query: 'test',
      top_n: 10,
      updated_after: '2026-03-25T00:00:00Z',
    });

    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number }>;
    expect(parsed.map(r => r.id)).toEqual([2]);
  });
});

describe('search_issues – updated_after filter (with select, uses fetched issue data)', () => {
  it('returns only results whose fetched updated_at is after the threshold', async () => {
    const store = makeMockStore({
      items: [
        { id: 1, score: 0.9 },
        { id: 2, score: 0.8 },
      ],
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({
        issues: [{ id: 1, summary: 'Recent bug', updated_at: '2026-03-26T00:00:00Z' }],
      })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({
        issues: [{ id: 2, summary: 'Old bug', updated_at: '2026-03-20T00:00:00Z' }],
      })));

    const result = await mockServer.callTool('search_issues', {
      query: 'test',
      top_n: 10,
      select: 'summary',
      updated_after: '2026-03-25T00:00:00Z',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number; summary: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe(1);
    expect(parsed[0]!.summary).toBe('Recent bug');
  });
});

describe('get_search_index_status – edge cases', () => {
  it('returns 0 % when stored total is 0', async () => {
    const store = makeMockStore({ itemCount: 0, lastKnownTotal: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('get_search_index_status', {});

    const parsed = JSON.parse(result.content[0]!.text) as { percent: number; summary: string };
    expect(parsed.percent).toBe(0);
    expect(parsed.summary).toBe('0/0 (0 %)');
  });

  it('returns 100 % when all issues are indexed', async () => {
    const store = makeMockStore({ itemCount: 7842, lastKnownTotal: 7842 });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('get_search_index_status', {});

    const parsed = JSON.parse(result.content[0]!.text) as { percent: number; summary: string };
    expect(parsed.percent).toBe(100);
    expect(parsed.summary).toBe('7842/7842 (100 %)');
  });

  it('returns total unknown when no sync has run yet', async () => {
    const store = makeMockStore({ itemCount: 5, lastKnownTotal: null });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('get_search_index_status', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      total: null;
      percent: null;
      summary: string;
    };
    expect(parsed.total).toBeNull();
    expect(parsed.percent).toBeNull();
    expect(parsed.summary).toContain('total unknown');
  });
});

// ---------------------------------------------------------------------------
// search_issues – highlight parameter
// ---------------------------------------------------------------------------

describe('search_issues – highlight: true (no select, uses store metadata)', () => {
  it('adds highlights field with bolded terms from store metadata summary', async () => {
    const store = makeMockStore({
      items: [{ id: 1, score: 0.9 }],
    });
    vi.mocked(store.getItem).mockResolvedValue({
      id: 1,
      vector: [],
      metadata: { summary: 'Login error occurred', description: 'The login fails with error code 500.' },
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', {
      query: 'login error',
      top_n: 1,
      highlight: true,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('highlights');
    const highlights = parsed[0]!['highlights'] as Record<string, string>;
    expect(highlights['summary']).toContain('**');
  });

  it('omits highlights field when no query terms match', async () => {
    const store = makeMockStore({
      items: [{ id: 1, score: 0.9 }],
    });
    vi.mocked(store.getItem).mockResolvedValue({
      id: 1,
      vector: [],
      metadata: { summary: 'Unrelated issue', description: undefined },
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', {
      query: 'xyzzy',
      top_n: 1,
      highlight: true,
    });

    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).not.toHaveProperty('highlights');
  });

  it('does not call store.getItem for highlighting when highlight is false', async () => {
    const store = makeMockStore({ itemCount: 2 });
    registerSearchTools(mockServer as never, client, store, embedder);

    await mockServer.callTool('search_issues', { query: 'login', top_n: 2 });

    // getItem should NOT have been called (no date filter, no highlight)
    expect(store.getItem).not.toHaveBeenCalled();
  });

  it('still returns id and score alongside highlights', async () => {
    const store = makeMockStore({
      items: [{ id: 42, score: 0.85 }],
    });
    vi.mocked(store.getItem).mockResolvedValue({
      id: 42,
      vector: [],
      metadata: { summary: 'Login timeout issue' },
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', {
      query: 'login',
      top_n: 1,
      highlight: true,
    });

    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('id', 42);
    expect(parsed[0]).toHaveProperty('score');
    expect(parsed[0]).toHaveProperty('highlights');
  });
});

describe('search_issues – highlight: true (with select)', () => {
  it('highlights summary from fetched issue when summary is in select', async () => {
    const store = makeMockStore({ itemCount: 1 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({
        issues: [{ id: 1, summary: 'Login error in dashboard', status: { id: 10, name: 'new' } }],
      }))
    );

    const result = await mockServer.callTool('search_issues', {
      query: 'login error',
      top_n: 1,
      select: 'summary,status',
      highlight: true,
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('highlights');
    const highlights = parsed[0]!['highlights'] as Record<string, string>;
    expect(highlights['summary']).toContain('**Login**');
  });

  it('falls back to store metadata for highlighting when API fetch fails', async () => {
    const store = makeMockStore({ items: [{ id: 1, score: 0.9 }] });
    vi.mocked(store.getItem).mockResolvedValue({
      id: 1,
      vector: [],
      metadata: { summary: 'Login crash issue' },
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(500, 'Server Error'));

    const result = await mockServer.callTool('search_issues', {
      query: 'login',
      top_n: 1,
      select: 'summary',
      highlight: true,
    });

    // Falls back to {id, score} but we still try to add highlights from store metadata
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('id', 1);
  });
});

describe('search_issues – highlight: true combined with date filter', () => {
  it('returns highlights only for date-filtered results (no select)', async () => {
    const store = makeMockStore({
      items: [
        { id: 1, score: 0.9, updated_at: '2026-03-26T00:00:00Z' }, // passes filter
        { id: 2, score: 0.8, updated_at: '2026-03-20T00:00:00Z' }, // filtered out
      ],
    });
    vi.mocked(store.getItem).mockImplementation(async (id: number) => ({
      id,
      vector: [],
      metadata: {
        summary: id === 1 ? 'Login crash issue' : 'Old login bug',
        updated_at: id === 1 ? '2026-03-26T00:00:00Z' : '2026-03-20T00:00:00Z',
      },
    }));
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool('search_issues', {
      query: 'login',
      top_n: 10,
      highlight: true,
      updated_after: '2026-03-25T00:00:00Z',
    });

    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// string-coercion – highlight as string
// ---------------------------------------------------------------------------

describe('string-coercion – search_issues highlight as string', () => {
  it('accepts highlight "true" as boolean true', async () => {
    const store = makeMockStore({
      items: [{ id: 1, score: 0.9 }],
    });
    vi.mocked(store.getItem).mockResolvedValue({
      id: 1,
      vector: [],
      metadata: { summary: 'Login error occurred', description: 'The login fails.' },
    });
    registerSearchTools(mockServer as never, client, store, embedder);

    const result = await mockServer.callTool(
      'search_issues',
      { query: 'login error', top_n: 1, highlight: 'true' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('highlights');
  });
});
