import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// vi.mock must be at module top level — vitest hoists it automatically
vi.mock('node:fs/promises');

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { MantisClient } from '../../src/client.js';
import { MetadataCache, type CachedMetadata } from '../../src/cache.js';
import { registerMetadataTools } from '../../src/tools/metadata.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const recordedFixturesDir = join(__dirname, '..', 'fixtures', 'recorded');

// Recorded fixture: single issue returned by issues?page=1&page_size=1
const sampleFixturePath = join(recordedFixturesDir, 'get_issue_fields_sample.json');
const recordedSampleFixture = existsSync(sampleFixturePath)
  ? (JSON.parse(readFileSync(sampleFixturePath, 'utf-8')) as { issues: Array<Record<string, unknown>> })
  : null;

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

function makeSampleMetadata(): CachedMetadata {
  return {
    timestamp: Date.now(),
    projects: [{ id: 1, name: 'Test Project' }],
    byProject: {},
    tags: [],
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

afterEach(() => {
  vi.unstubAllGlobals();
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
    const parsed = JSON.parse(result.content[0]!.text) as { projects: number };
    expect(parsed.projects).toBe(1);
  });

  it('returns compact summary (no raw arrays)', async () => {
    const metadata = makeSampleMetadata();
    vi.mocked(readFile).mockResolvedValue(makeValidMetadataCacheFile(metadata) as any);

    const result = await mockServer.callTool('get_metadata', {});
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(typeof parsed['projects']).toBe('number');
    expect(typeof parsed['tags']).toBe('number');
    expect(Array.isArray(parsed['projects'])).toBe(false);
  });

  it('byProject contains name and counts per project', async () => {
    const metadata: CachedMetadata = {
      timestamp: Date.now(),
      projects: [{ id: 1, name: 'Test Project' }],
      byProject: { 1: { users: [{ id: 1, name: 'u' }], versions: [{ id: 1, name: 'v1' }], categories: [{ id: 1, name: 'c' }, { id: 2, name: 'c2' }] } },
      tags: [],
    };
    vi.mocked(readFile).mockResolvedValue(makeValidMetadataCacheFile(metadata) as any);

    const result = await mockServer.callTool('get_metadata', {});
    const parsed = JSON.parse(result.content[0]!.text) as { byProject: Record<string, { name: string; users: number; versions: number; categories: number }> };
    const entry = Object.values(parsed.byProject)[0]!;
    expect(typeof entry.name).toBe('string');
    expect(typeof entry.users).toBe('number');
    expect(typeof entry.versions).toBe('number');
    expect(typeof entry.categories).toBe('number');
  });

  it('ttl_seconds is positive for fresh cache', async () => {
    const metadata = makeSampleMetadata();
    vi.mocked(readFile).mockResolvedValue(makeValidMetadataCacheFile(metadata) as any);

    const result = await mockServer.callTool('get_metadata', {});
    const parsed = JSON.parse(result.content[0]!.text) as { ttl_seconds: number };
    expect(parsed.ttl_seconds).toBeGreaterThan(0);
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
    expect(writeFile).toHaveBeenCalled();
    const writtenPath = vi.mocked(writeFile).mock.calls[0]![0] as string;
    expect(writtenPath).toContain('metadata.json');
  });
});

// ---------------------------------------------------------------------------
// sync_metadata
// ---------------------------------------------------------------------------

describe('sync_metadata', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('sync_metadata')).toBe(true);
  });

  it('fetches and stores tags at root level (#7860)', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const projectsResponse = { projects: [{ id: 1, name: 'Test Project' }] };
    const tagsResponse = { tags: [{ id: 1, name: 'regression' }, { id: 2, name: 'ui' }] };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectsResponse)))                                   // GET /projects
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ users: [] })))                                     // GET /projects/1/users
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ versions: [] })))                                  // GET /projects/1/versions
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ projects: [{ id: 1, categories: [] }] })))         // GET /projects/1
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(tagsResponse)));                                     // GET /tags

    const result = await mockServer.callTool('sync_metadata', {});

    expect(result.isError).toBeUndefined();
    // Tags count must appear in the success message
    expect(result.content[0]!.text).toContain('Global tags: 2');

    // The written metadata.json must contain tags at root level
    const writeCall = vi.mocked(writeFile).mock.calls.find(
      call => String(call[0]).includes('metadata.json')
    );
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string) as { data: { tags: unknown[] } };
    expect(Array.isArray(written.data.tags)).toBe(true);
    expect(written.data.tags).toHaveLength(2);
  });

  it('strips custom_fields from projects before writing to cache', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const projectsResponse = {
      projects: [{
        id: 1,
        name: 'Test Project',
        status: { id: 10, name: 'development', label: 'Entwicklung' },
        custom_fields: [{ id: 6, name: 'Reklamieren', type: 'checkbox' }],
      }],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectsResponse)))
      .mockResolvedValue(makeResponse(200, JSON.stringify({ users: [], versions: [], projects: [{ id: 1, categories: [] }], tags: [] })));

    await mockServer.callTool('sync_metadata', {});

    const writeCall = vi.mocked(writeFile).mock.calls.find(call => String(call[0]).includes('metadata.json'));
    const written = JSON.parse(writeCall![1] as string) as { data: { projects: Array<Record<string, unknown>> } };
    expect(written.data.projects[0]).not.toHaveProperty('custom_fields');
  });

  it('preserves label on status and view_state when writing to cache', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const projectsResponse = {
      projects: [{
        id: 1,
        name: 'Test Project',
        status: { id: 10, name: 'development', label: 'Entwicklung' },
        view_state: { id: 10, name: 'public', label: 'Öffentlich' },
      }],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectsResponse)))
      .mockResolvedValue(makeResponse(200, JSON.stringify({ users: [], versions: [], projects: [{ id: 1, categories: [] }], tags: [] })));

    await mockServer.callTool('sync_metadata', {});

    const writeCall = vi.mocked(writeFile).mock.calls.find(call => String(call[0]).includes('metadata.json'));
    const written = JSON.parse(writeCall![1] as string) as { data: { projects: Array<Record<string, unknown>> } };
    const project = written.data.projects[0]!;
    expect((project['status'] as Record<string, unknown>)['label']).toBe('Entwicklung');
    expect((project['view_state'] as Record<string, unknown>)['label']).toBe('Öffentlich');
  });

  it('fetches versions with obsolete=1 and inherit=1', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const projectsResponse = { projects: [{ id: 1, name: 'Test Project' }] };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectsResponse)))
      .mockResolvedValue(makeResponse(200, JSON.stringify({ users: [], versions: [], projects: [{ id: 1, categories: [] }], tags: [] })));

    await mockServer.callTool('sync_metadata', {});

    // The versions call must include obsolete=1 and inherit=1
    const versionCall = vi.mocked(fetch).mock.calls.find(
      call => String(call[0]).includes('/versions')
    );
    expect(versionCall).toBeDefined();
    const url = new URL(versionCall![0] as string);
    expect(url.searchParams.get('obsolete')).toBe('1');
    expect(url.searchParams.get('inherit')).toBe('1');
  });

  it('stores categories from GET /projects/{id} response (not from /categories sub-path)', async () => {
    // Regression: sync_metadata called projects/{id}/categories which returned []
    // on this MantisBT installation. The correct source is projects/{id}.projects[0].categories,
    // identical to what get_project_categories uses.
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const projectsResponse = { projects: [{ id: 1, name: 'Test Project' }] };
    const usersResponse = { users: [] };
    const versionsResponse = { versions: [] };
    // GET /projects/1 returns categories embedded in the project object
    const projectDetailResponse = {
      projects: [{ id: 1, name: 'Test Project', categories: [{ id: 10, name: 'General' }, { id: 11, name: 'Bug' }] }],
    };
    const tagsResponse = { tags: [] };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectsResponse)))      // GET /projects
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(usersResponse)))         // GET /projects/1/users
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(versionsResponse)))      // GET /projects/1/versions
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectDetailResponse))) // GET /projects/1
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(tagsResponse)));         // GET /tags

    const result = await mockServer.callTool('sync_metadata', {});

    expect(result.isError).toBeUndefined();
    // Summary must report 2 categories for the project
    expect(result.content[0]!.text).toContain('2 categories');

    // Written cache must contain categories in byProject
    const writeCall = vi.mocked(writeFile).mock.calls.find(
      call => String(call[0]).includes('metadata.json')
    );
    const written = JSON.parse(writeCall![1] as string) as {
      data: { byProject: Record<string, { categories: unknown[] }> };
    };
    expect(written.data.byProject[1]!.categories).toHaveLength(2);
  });

  it('stores empty tags array when tags endpoint fails (#7860)', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const projectsResponse = { projects: [] };
    // Tags endpoint returns 500 — must degrade gracefully
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(projectsResponse)))
      .mockResolvedValueOnce(makeResponse(500, 'Internal Server Error'));

    const result = await mockServer.callTool('sync_metadata', {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('Global tags: 0');
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

// ---------------------------------------------------------------------------
// get_issue_fields – recorded fixtures
// ---------------------------------------------------------------------------

describe('get_issue_fields – recorded fixtures', () => {
  it.skipIf(!recordedSampleFixture)('discovers fields from recorded sample issue', async () => {
    // Cache miss — force live discovery
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(recordedSampleFixture!)));

    const result = await mockServer.callTool('get_issue_fields', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { fields: string[]; source: string };
    expect(parsed.source).toBe('live');

    // Every top-level key of the recorded sample issue must be in the discovered fields
    const sampleKeys = Object.keys(recordedSampleFixture!.issues[0]!);
    for (const key of sampleKeys) {
      expect(parsed.fields).toContain(key);
    }

    // EMPTY_STRIPPED_FIELDS must always be present even if absent from the sample
    expect(parsed.fields).toContain('attachments');
    expect(parsed.fields).toContain('notes');
    expect(parsed.fields).toContain('relationships');
  });
});
