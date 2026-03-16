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
