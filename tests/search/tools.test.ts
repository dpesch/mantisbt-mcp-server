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
// get_search_index_status – normal case
// ---------------------------------------------------------------------------

describe('get_search_index_status – with data', () => {
  it('returns summary, indexed, total, percent and last_synced_at', async () => {
    const store = makeMockStore({ itemCount: 42, lastSyncedAt: '2026-03-16T10:00:00.000Z' });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 100 }))
    );

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

  it('requests only page_size: 1 to minimise API payload', async () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 50 }))
    );

    await mockServer.callTool('get_search_index_status', {});

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('page_size=1');
  });
});

// ---------------------------------------------------------------------------
// get_search_index_status – edge cases
// ---------------------------------------------------------------------------

describe('get_search_index_status – edge cases', () => {
  it('returns 0 % when total is 0 (not null)', async () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 0 }))
    );

    const result = await mockServer.callTool('get_search_index_status', {});

    const parsed = JSON.parse(result.content[0]!.text) as { percent: number; summary: string };
    expect(parsed.percent).toBe(0);
    expect(parsed.summary).toBe('0/0 (0 %)');
  });

  it('returns 100 % when all issues are indexed', async () => {
    const store = makeMockStore({ itemCount: 7842 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 7842 }))
    );

    const result = await mockServer.callTool('get_search_index_status', {});

    const parsed = JSON.parse(result.content[0]!.text) as { percent: number; summary: string };
    expect(parsed.percent).toBe(100);
    expect(parsed.summary).toBe('7842/7842 (100 %)');
  });

  it('handles missing total_count (null) gracefully', async () => {
    const store = makeMockStore({ itemCount: 5 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [] })) // no total_count
    );

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

  it('returns isError on API failure', async () => {
    const store = makeMockStore({ itemCount: 0 });
    registerSearchTools(mockServer as never, client, store, embedder);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(500, JSON.stringify({ message: 'Internal Server Error' }))
    );

    const result = await mockServer.callTool('get_search_index_status', {});

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});
