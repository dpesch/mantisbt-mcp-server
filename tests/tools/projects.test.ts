import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// vi.mock must be at module top level — vitest hoists it automatically
vi.mock('node:fs/promises');

import { readFile } from 'node:fs/promises';
import { MantisClient } from '../../src/client.js';
import { MetadataCache, type CachedMetadata } from '../../src/cache.js';
import type { MantisUser } from '../../src/types.js';
import { registerProjectTools } from '../../src/tools/projects.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Fixtures laden (mit Inline-Fallback)
// ---------------------------------------------------------------------------

const listProjectsFixturePath = join(fixturesDir, 'list_projects.json');

const listProjectsFixture = existsSync(listProjectsFixturePath)
  ? (JSON.parse(readFileSync(listProjectsFixturePath, 'utf-8')) as { projects: Array<{ id: number; name: string }> })
  : { projects: [{ id: 1, name: 'Test Project' }] };

const firstProjectId = listProjectsFixture.projects[0]?.id ?? 1;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;
let cache: MetadataCache;

beforeEach(() => {
  vi.resetAllMocks();
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  cache = new MetadataCache('/tmp/test-cache-projects', 3600);
  registerProjectTools(mockServer as never, client, cache);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedCache(users: MantisUser[]): Promise<void> {
  const data: CachedMetadata = {
    timestamp: Date.now(),
    projects: [{ id: 7, name: 'TestProject' }],
    byProject: { 7: { users, versions: [], categories: [] } },
    tags: [],
  };
  vi.mocked(readFile).mockResolvedValue(JSON.stringify({ timestamp: Date.now(), data }) as any);
}

// ---------------------------------------------------------------------------
// list_projects
// ---------------------------------------------------------------------------

describe('list_projects', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('list_projects')).toBe(true);
  });

  it('gibt Projekte-Array zurück', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listProjectsFixture)));

    const result = await mockServer.callTool('list_projects', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('gibt isError: true bei 401 zurück', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(401, JSON.stringify({ message: 'Unauthorized' })),
    );

    const result = await mockServer.callTool('list_projects', {});

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });

  it('strips custom_fields from projects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({
        projects: [{ id: 1, name: 'Alpha', custom_fields: [{ field: { id: 9, name: 'cf' }, value: 'x' }] }],
      }))
    );
    const result = await mockServer.callTool('list_projects', {});
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ custom_fields?: unknown }>;
    expect(parsed[0]!.custom_fields).toBeUndefined();
  });

  it('preserves status, enabled, view_state after normalization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({
        projects: [{ id: 1, name: 'Alpha', enabled: true, status: { id: 10, name: 'development', label: 'Dev' }, view_state: { id: 10, name: 'public', label: 'Public' } }],
      }))
    );
    const result = await mockServer.callTool('list_projects', {});
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]!['enabled']).toBe(true);
    expect((parsed[0]!['status'] as Record<string, unknown>)['id']).toBe(10);
    expect((parsed[0]!['view_state'] as Record<string, unknown>)['id']).toBe(10);
  });

  it('normalizes subprojects recursively', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({
        projects: [{ id: 1, name: 'Parent', subprojects: [{ id: 2, name: 'Child', custom_fields: [{ field: { id: 9 }, value: 'x' }] }] }],
      }))
    );
    const result = await mockServer.callTool('list_projects', {});
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ subprojects?: Array<{ custom_fields?: unknown }> }>;
    expect(parsed[0]!.subprojects![0]!.custom_fields).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// get_project_versions
// ---------------------------------------------------------------------------

describe('get_project_versions', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('get_project_versions')).toBe(true);
  });

  it('ruft den richtigen Endpoint auf', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ versions: [] })));

    await mockServer.callTool('get_project_versions', { project_id: firstProjectId });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain(`projects/${firstProjectId}/versions`);
  });

  it('does not pass obsolete/inherit by default', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ versions: [] })));

    await mockServer.callTool('get_project_versions', { project_id: firstProjectId }, { validate: true });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.has('obsolete')).toBe(false);
    expect(url.searchParams.has('inherit')).toBe(false);
  });

  it('passes obsolete=1 when obsolete: true', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ versions: [] })));

    await mockServer.callTool('get_project_versions', { project_id: firstProjectId, obsolete: true }, { validate: true });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('obsolete')).toBe('1');
  });

  it('passes inherit=1 when inherit: true', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ versions: [] })));

    await mockServer.callTool('get_project_versions', { project_id: firstProjectId, inherit: true }, { validate: true });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('inherit')).toBe('1');
  });

  it('gibt leeres Array zurück wenn keine Versionen vorhanden', async () => {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, 'get_project_versions.json'), 'utf-8')) as { versions: unknown[] };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(fixture)));

    const result = await mockServer.callTool('get_project_versions', { project_id: firstProjectId });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });

  it('gibt Versionen zurück wenn vorhanden', async () => {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, 'get_project_versions_with_data.json'), 'utf-8')) as { versions: Array<{ id: number; name: string; released: boolean }> };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(fixture)));

    const result = await mockServer.callTool('get_project_versions', { project_id: firstProjectId });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number; name: string; released: boolean }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('name');
    expect(parsed[0]).toHaveProperty('released');
  });
});

// ---------------------------------------------------------------------------
// get_project_categories
// ---------------------------------------------------------------------------

describe('get_project_categories', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('get_project_categories')).toBe(true);
  });

  it('strippt den [All Projects] Prefix', async () => {
    const categoriesFixture = {
      projects: [{
        id: firstProjectId,
        name: 'Test Project',
        categories: [
          { id: 1, name: '[All Projects] General' },
          { id: 2, name: 'Backend' },
        ],
      }],
    };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(categoriesFixture)));

    const result = await mockServer.callTool('get_project_categories', { project_id: firstProjectId });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ id: number; name: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    // Erstes Element soll den Prefix nicht mehr haben
    const firstCategory = parsed.find((c) => c.id === 1);
    expect(firstCategory?.name).toBe('General');
    // Zweites Element ohne Prefix bleibt unverändert
    const secondCategory = parsed.find((c) => c.id === 2);
    expect(secondCategory?.name).toBe('Backend');
  });
});

// ---------------------------------------------------------------------------
// find_project_member
// ---------------------------------------------------------------------------

describe('find_project_member', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('find_project_member')).toBe(true);
  });

  it('returns cached users without fetch', async () => {
    const users: MantisUser[] = [{ id: 1, name: 'alice' }, { id: 2, name: 'bob' }];
    await seedCache(users);
    const result = await mockServer.callTool('find_project_member', { project_id: 7 });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(2);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('filters case-insensitively by name', async () => {
    await seedCache([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
    const result = await mockServer.callTool('find_project_member', { project_id: 7, query: 'alice' });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.name).toBe('Alice');
  });

  it('filters by real_name', async () => {
    await seedCache([{ id: 1, name: 'a', real_name: 'Alice Smith' }, { id: 2, name: 'b', real_name: 'Bob Jones' }]);
    const result = await mockServer.callTool('find_project_member', { project_id: 7, query: 'smith' });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.real_name).toBe('Alice Smith');
  });

  it('filters by email', async () => {
    await seedCache([{ id: 1, name: 'a', email: 'alice@example.com' }, { id: 2, name: 'b', email: 'bob@example.com' }]);
    const result = await mockServer.callTool('find_project_member', { project_id: 7, query: 'alice@' });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(1);
  });

  it('applies default limit of 10', async () => {
    const users: MantisUser[] = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `user${i + 1}` }));
    await seedCache(users);
    const result = await mockServer.callTool('find_project_member', { project_id: 7 });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(10);
  });

  it('respects explicit limit', async () => {
    const users: MantisUser[] = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `user${i + 1}` }));
    await seedCache(users);
    const result = await mockServer.callTool('find_project_member', { project_id: 7, limit: 5 });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(5);
  });

  it('returns empty array when no match', async () => {
    await seedCache([{ id: 1, name: 'alice' }]);
    const result = await mockServer.callTool('find_project_member', { project_id: 7, query: 'zzznomatch' });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(0);
  });

  it('falls back to live API when cache is cold', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({ users: [{ id: 1, name: 'alice' }] }))
    );
    const result = await mockServer.callTool('find_project_member', { project_id: 7 });
    const parsed = JSON.parse(result.content[0]!.text) as MantisUser[];
    expect(parsed).toHaveLength(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });

  it('returns isError on API failure', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(500, JSON.stringify({ message: 'Internal Server Error' })));
    const result = await mockServer.callTool('find_project_member', { project_id: 7 });
    expect(result.isError).toBe(true);
  });

  it('rejects invalid project_id', async () => {
    const result = await mockServer.callTool('find_project_member', { project_id: -1 }, { validate: true });
    expect(result.isError).toBe(true);
  });

  it('rejects limit < 1', async () => {
    const result = await mockServer.callTool('find_project_member', { project_id: 7, limit: 0 }, { validate: true });
    expect(result.isError).toBe(true);
  });
});
