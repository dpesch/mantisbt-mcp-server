import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../../src/client.js';
import { registerProjectTools } from '../../src/tools/projects.js';
import { MockMcpServer } from '../helpers/mock-server.js';

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
// Helper
// ---------------------------------------------------------------------------

function makeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    text: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  registerProjectTools(mockServer as never, client);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
