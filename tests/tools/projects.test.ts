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

  it('returns the subProjects references MantisBT sends as subprojects (#8616)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(200, JSON.stringify({
        projects: [
          { id: 1, name: 'Parent', subProjects: [{ id: 2, name: 'Child', extra: 'x' }] },
          { id: 2, name: 'Child' },
        ],
      }))
    );
    const result = await mockServer.callTool('list_projects', {});
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]!['subprojects']).toEqual([{ id: 2, name: 'Child' }]);
    expect(parsed[0]!['subProjects']).toBeUndefined();
    expect(parsed[1]!['subprojects']).toBeUndefined();
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

// ---------------------------------------------------------------------------
// get_project (#8497) — replaces get_project_categories/_users/_versions and
// find_project_member
// ---------------------------------------------------------------------------

describe('get_project', () => {
  const PROJECT = {
    id: 7,
    name: 'TestProject',
    description: 'Demo',
    status: { id: 10, name: 'development', label: 'Entwicklung' },
    enabled: true,
    view_state: { id: 10, name: 'public', label: 'öffentlich' },
    categories: [{ id: 1, name: '[All Projects] General' }, { id: 2, name: 'Backend' }],
  };
  const USERS: MantisUser[] = [
    { id: 1, name: 'alice', real_name: 'Alice Smith' },
    { id: 2, name: 'bob', real_name: 'Bob Jones' },
  ];

  /** Answers each request by URL path, since get_project fetches in parallel. */
  function routeFetch(routes: Record<string, unknown>): void {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname.replace(/^.*\/api\/rest\//, '');
      if (!(path in routes)) return makeResponse(404, JSON.stringify({ message: `no route ${path}` }));
      return makeResponse(200, JSON.stringify(routes[path]));
    });
  }
  const urls = () => vi.mocked(fetch).mock.calls.map(c => new URL(String(c[0])));
  const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0]!.text) as Record<string, unknown>;

  beforeEach(() => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
  });

  it('returns the direct subprojects as references (#8616)', async () => {
    // GET /projects/{id} lists the project first, followed by its subprojects
    routeFetch({ 'projects/7': { projects: [
      { ...PROJECT, subProjects: [{ id: 8, name: 'Sub' }] },
      { id: 8, name: 'Sub' },
    ] } });

    const parsed = parse(await mockServer.callTool('get_project', { project_id: 7 }, { validate: true }));

    expect(parsed['id']).toBe(7);
    expect(parsed['subprojects']).toEqual([{ id: 8, name: 'Sub' }]);
  });

  it('returns only the project master data by default (one request)', async () => {
    routeFetch({ 'projects/7': { projects: [PROJECT] } });

    const result = await mockServer.callTool('get_project', { project_id: 7 }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const parsed = parse(result);
    expect(parsed).toMatchObject({ id: 7, name: 'TestProject', description: 'Demo' });
    expect(parsed).not.toHaveProperty('categories');
    expect(parsed).not.toHaveProperty('users');
    expect(parsed).not.toHaveProperty('versions');
  });

  it('includes categories without the [All Projects] prefix and without an extra request', async () => {
    routeFetch({ 'projects/7': { projects: [PROJECT] } });

    const result = await mockServer.callTool('get_project', { project_id: 7, include: ['categories'] }, { validate: true });

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    expect(parse(result)['categories']).toEqual([{ id: 1, name: 'General' }, { id: 2, name: 'Backend' }]);
  });

  it('includes users and versions, passing access_level, obsolete and inherit', async () => {
    routeFetch({
      'projects/7': { projects: [PROJECT] },
      'projects/7/users': { users: USERS },
      'projects/7/versions': { versions: [{ id: 3, name: '1.0', released: true }] },
      'projects': { projects: [PROJECT] },
    });

    const result = await mockServer.callTool(
      'get_project',
      { project_id: 7, include: ['users', 'versions'], access_level: 55, obsolete: true, inherit: true },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    const usersUrl = urls().find(u => u.pathname.endsWith('/users'))!;
    const versionsUrl = urls().find(u => u.pathname.endsWith('/versions'))!;
    expect(usersUrl.searchParams.get('access_level')).toBe('55');
    expect(versionsUrl.searchParams.get('obsolete')).toBe('1');
    expect(versionsUrl.searchParams.get('inherit')).toBe('1');
    const parsed = parse(result);
    expect(parsed['users']).toEqual(USERS);
    expect(parsed['versions']).toEqual([{ id: 3, name: '1.0', released: true }]);
  });

  it('member_query implies users and returns all matches (case-insensitive, name/real_name/email)', async () => {
    routeFetch({ 'projects/7': { projects: [PROJECT] }, 'projects/7/users': { users: USERS } });

    const result = await mockServer.callTool('get_project', { project_id: 7, member_query: 'SMITH' }, { validate: true });

    expect(parse(result)['users']).toEqual([USERS[0]]);
  });

  it('obsolete/inherit imply versions', async () => {
    routeFetch({ 'projects/7': { projects: [PROJECT] }, 'projects/7/versions': { versions: [] }, 'projects': { projects: [PROJECT] } });

    const result = await mockServer.callTool('get_project', { project_id: 7, obsolete: true }, { validate: true });

    expect(parse(result)['versions']).toEqual([]);
    expect(urls().some(u => u.pathname.endsWith('/versions'))).toBe(true);
  });

  // #8614: MantisBT's /versions handler drops obsolete and inherit, so the
  // obsolete versions must come from the GET /projects listing.
  it('obsolete: returns obsolete versions that /versions leaves out', async () => {
    const active = { id: 813, name: '1.2.4', released: false, obsolete: false, timestamp: '2026-11-10T00:00:00+01:00' };
    const obsolete = { id: 791, name: '1.0.0', description: '', released: true, obsolete: true, timestamp: '2020-01-01T00:00:00+01:00' };
    routeFetch({
      'projects/7': { projects: [PROJECT] },
      'projects/7/versions': { versions: [active] },
      'projects': { projects: [{ ...PROJECT, versions: [active, obsolete] }] },
    });

    const result = await mockServer.callTool('get_project', { project_id: 7, obsolete: true }, { validate: true });

    expect(parse(result)['versions']).toEqual([active, { id: 791, name: '1.0.0', released: true, obsolete: true, timestamp: obsolete.timestamp }]);
  });

  it('get_project_versions: obsolete: true returns obsolete versions as well', async () => {
    const obsolete = { id: 791, name: '1.0.0', released: true, obsolete: true };
    routeFetch({
      'projects/7/versions': { versions: [] },
      'projects': { projects: [{ id: 7, versions: [obsolete] }] },
    });

    const result = await mockServer.callTool('get_project_versions', { project_id: 7, obsolete: true }, { validate: true });

    expect(JSON.parse(result.content[0]!.text)).toEqual([obsolete]);
  });

  it('does not fetch GET /projects without obsolete or inherit', async () => {
    routeFetch({ 'projects/7': { projects: [PROJECT] }, 'projects/7/versions': { versions: [] } });

    await mockServer.callTool('get_project', { project_id: 7, include: ['versions'] }, { validate: true });

    expect(urls().some(u => u.pathname.endsWith('/rest/projects'))).toBe(false);
  });

  it('serves users from a fresh cache when no access_level is given', async () => {
    await seedCache(USERS);
    routeFetch({ 'projects/7': { projects: [PROJECT] } });

    const result = await mockServer.callTool('get_project', { project_id: 7, member_query: 'bob' }, { validate: true });

    expect(urls().some(u => u.pathname.endsWith('/users'))).toBe(false);
    expect(parse(result)['users']).toEqual([USERS[1]]);
  });

  it('asks the API for users when access_level is given, even with a fresh cache', async () => {
    await seedCache(USERS);
    routeFetch({ 'projects/7': { projects: [PROJECT] }, 'projects/7/users': { users: [USERS[0]] } });

    const result = await mockServer.callTool('get_project', { project_id: 7, include: ['users'], access_level: 70 }, { validate: true });

    expect(urls().some(u => u.pathname.endsWith('/users'))).toBe(true);
    expect(parse(result)['users']).toEqual([USERS[0]]);
  });

  it('returns isError when the project does not exist', async () => {
    routeFetch({});

    const result = await mockServer.callTool('get_project', { project_id: 999 }, { validate: true });

    expect(result.isError).toBe(true);
  });

  it('rejects an unknown include value', async () => {
    const result = await mockServer.callTool('get_project', { project_id: 7, include: ['tags'] }, { validate: true });

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
