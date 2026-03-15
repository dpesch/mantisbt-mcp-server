import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock must be at module top level — vitest hoists it automatically
vi.mock('node:fs/promises');

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { MantisClient } from '../../src/client.js';
import { MetadataCache, type CachedMetadata } from '../../src/cache.js';
import { registerMetadataTools } from '../../src/tools/metadata.js';
import { MockMcpServer } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_DIR = '/tmp/test-cache-metadata';
const TTL = 3600;

function makeServer(): MockMcpServer {
  return new MockMcpServer();
}

function makeClient(): MantisClient {
  return new MantisClient('https://mantis.example.com', 'test-token');
}

function makeCache(): MetadataCache {
  return new MetadataCache(CACHE_DIR, TTL);
}

function makeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    text: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
  } as unknown as Response;
}

function makeSampleMetadata(): CachedMetadata {
  return {
    timestamp: Date.now(),
    projects: [{ id: 1, name: 'Test Project' }],
    byProject: {},
  };
}

function makeValidMetadataCacheFile(data: CachedMetadata): string {
  return JSON.stringify({ timestamp: Date.now(), data });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;
let cache: MetadataCache;

beforeEach(() => {
  vi.resetAllMocks();
  mockServer = makeServer();
  client = makeClient();
  cache = makeCache();
  registerMetadataTools(mockServer as never, client, cache);
  vi.stubGlobal('fetch', vi.fn());
});

// ---------------------------------------------------------------------------
// get_metadata
// ---------------------------------------------------------------------------

describe('get_metadata', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('get_metadata')).toBe(true);
  });

  it('loads from cache when valid (single file read — no re-fetch)', async () => {
    const metadata = makeSampleMetadata();
    vi.mocked(readFile).mockResolvedValue(makeValidMetadataCacheFile(metadata) as any);

    const result = await mockServer.callTool('get_metadata', {});

    expect(result.isError).toBeUndefined();
    // fetch must NOT have been called — data came from cache
    expect(fetch).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0]!.text) as CachedMetadata;
    expect(parsed.projects).toEqual(metadata.projects);
  });

  it('fetches and caches when cache is missing', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const projectsResponse = { projects: [{ id: 1, name: 'Test Project' }] };
    const emptyResponse = { users: [], versions: [], categories: [] };
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectsResponse)))
      .mockResolvedValue(makeResponse(200, JSON.stringify(emptyResponse)));

    const result = await mockServer.callTool('get_metadata', {});

    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// get_issue_fields
// ---------------------------------------------------------------------------

describe('get_issue_fields', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('get_issue_fields')).toBe(true);
  });

  it('returns cached fields when cache is valid', async () => {
    const cachedFields = ['id', 'summary', 'status', 'priority', 'attachments'];
    const cacheFile = JSON.stringify({ timestamp: Date.now(), fields: cachedFields });

    // loadIssueFields reads from issue_fields.json
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes('issue_fields.json')) {
        return cacheFile as any;
      }
      throw new Error('ENOENT');
    });

    const result = await mockServer.callTool('get_issue_fields', {});

    expect(result.isError).toBeUndefined();
    // fetch must NOT have been called — data came from cache
    expect(fetch).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0]!.text) as { fields: string[]; source: string };
    expect(parsed.source).toBe('cache');
    expect(parsed.fields).toEqual(cachedFields);
  });

  it('fetches sample issue and discovers fields', async () => {
    // Cache miss
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const sampleIssue = {
      id: 42,
      summary: 'Sample',
      status: { id: 10, name: 'new' },
      priority: { id: 30, name: 'normal' },
      reporter: { id: 1, name: 'user' },
    };
    const issuesResponse = { issues: [sampleIssue] };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(issuesResponse)));

    const result = await mockServer.callTool('get_issue_fields', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { fields: string[]; source: string };
    expect(parsed.source).toBe('live');
    // Fields from sample issue
    expect(parsed.fields).toContain('id');
    expect(parsed.fields).toContain('summary');
    expect(parsed.fields).toContain('status');
    // Fields from EMPTY_STRIPPED_FIELDS that are always merged in
    expect(parsed.fields).toContain('attachments');
    expect(parsed.fields).toContain('notes');
    expect(parsed.fields).toContain('relationships');
  });

  it('falls back to static list when no issues available', async () => {
    // Cache miss
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const emptyIssuesResponse = { issues: [] };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(emptyIssuesResponse)));

    const result = await mockServer.callTool('get_issue_fields', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { fields: string[]; source: string };
    expect(parsed.source).toBe('static');
    // Static list must contain common fields
    expect(parsed.fields).toContain('id');
    expect(parsed.fields).toContain('summary');
    expect(parsed.fields).toContain('status');
    expect(parsed.fields).toContain('attachments');
    expect(parsed.fields).toContain('notes');
  });

  it('caches discovered fields after fetching', async () => {
    // Cache miss
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const sampleIssue = { id: 1, summary: 'Test', status: { id: 10, name: 'new' } };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [sampleIssue] })));

    await mockServer.callTool('get_issue_fields', {});

    // writeFile must have been called with issue_fields.json path
    expect(writeFile).toHaveBeenCalled();
    const writtenPath = vi.mocked(writeFile).mock.calls.find(
      call => String(call[0]).includes('issue_fields.json')
    );
    expect(writtenPath).toBeDefined();

    // Written content must be valid JSON with a fields array
    const writtenContent = writtenPath![1] as string;
    const parsed = JSON.parse(writtenContent) as { timestamp: number; fields: string[] };
    expect(Array.isArray(parsed.fields)).toBe(true);
    expect(parsed.fields.length).toBeGreaterThan(0);
    expect(typeof parsed.timestamp).toBe('number');
  });
});
