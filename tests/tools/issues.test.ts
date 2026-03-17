import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../../src/client.js';
import { registerIssueTools } from '../../src/tools/issues.js';
import { MetadataCache } from '../../src/cache.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';
import { MANTIS_RESOLVED_STATUS_ID } from '../../src/constants.js';

function makeStubCache(projectUsers?: Array<{ id: number; name: string; real_name?: string }>): MetadataCache {
  return {
    loadIfValid: vi.fn(async () => projectUsers ? {
      timestamp: Date.now(),
      projects: [],
      tags: [],
      byProject: { 1: { users: projectUsers, versions: [], categories: [] } },
    } : null),
  } as unknown as MetadataCache;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Fixtures laden (mit Inline-Fallback)
// ---------------------------------------------------------------------------

const getIssueFixturePath = join(fixturesDir, 'get_issue.json');
const listIssuesFixturePath = join(fixturesDir, 'list_issues.json');

const getIssueFixture = existsSync(getIssueFixturePath)
  ? (JSON.parse(readFileSync(getIssueFixturePath, 'utf-8')) as { issues: Array<{ id: number; summary: string }> })
  : { issues: [{ id: 42, summary: 'Test Issue' }] };

const listIssuesFixture = existsSync(listIssuesFixturePath)
  ? (JSON.parse(readFileSync(listIssuesFixturePath, 'utf-8')) as { issues: Array<{ id: number; summary: string; status: { id: number; name: string } }>; total_count: number })
  : { issues: [{ id: 42, summary: 'Test Issue', status: { id: 80, name: 'resolved' } }], total_count: 1 };

const recordedListIssuesPath = join(fixturesDir, 'recorded', 'list_issues.json');
const recordedListIssuesFixture = existsSync(recordedListIssuesPath)
  ? (JSON.parse(readFileSync(recordedListIssuesPath, 'utf-8')) as { issues: Array<{ id: number; summary: string; status: { id: number; name: string } }> })
  : null;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  registerIssueTools(mockServer as never, client, makeStubCache());
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// get_issue
// ---------------------------------------------------------------------------

describe('get_issue', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('get_issue')).toBe(true);
  });

  it('gibt issue-Daten aus der Fixture zurück', async () => {
    const issueId = getIssueFixture.issues[0]!.id;
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(getIssueFixture)));

    const result = await mockServer.callTool('get_issue', { id: issueId });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { id: number };
    expect(parsed.id).toBe(issueId);
  });

  it('ruft den richtigen Endpoint auf', async () => {
    const issueId = getIssueFixture.issues[0]!.id;
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(getIssueFixture)));

    await mockServer.callTool('get_issue', { id: issueId });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain(`issues/${issueId}`);
  });

  it('gibt isError: true bei 404 zurück', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(404, JSON.stringify({ message: 'Issue not found' })),
    );

    const result = await mockServer.callTool('get_issue', { id: 9999 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});

// ---------------------------------------------------------------------------
// create_issue
// ---------------------------------------------------------------------------

describe('create_issue', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('create_issue')).toBe(true);
  });

  it('sends severity: { name: "minor" } by default when no severity is provided', async () => {
    // Regression: omitting severity caused MantisBT to store 0 → displayed as "@0@".
    // validate: true ensures Zod defaults are applied before the handler runs.
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 100, summary: 'Test' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Test issue',
      project_id: 1,
      category: 'General',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.severity).toEqual({ name: 'minor' });
  });

  it('returns full issue object when API responds with complete issue', async () => {
    const fullIssue = { id: 100, summary: 'New issue', status: { id: 10, name: 'new' }, severity: { id: 50, name: 'minor' } };
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: fullIssue }))
    );

    const result = await mockServer.callTool('create_issue', {
      summary: 'New issue', project_id: 1, category: 'General',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as typeof fullIssue;
    expect(parsed.id).toBe(100);
    expect(parsed.summary).toBe('New issue');
    // Only one API call — no extra GET needed
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches full issue via GET when API returns only an id (older MantisBT)', async () => {
    const fullIssue = { id: 101, summary: 'Created issue', status: { id: 10, name: 'new' } };
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ id: 101 })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [fullIssue] })));

    const result = await mockServer.callTool('create_issue', {
      summary: 'Created issue', project_id: 1, category: 'General',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as typeof fullIssue;
    expect(parsed.summary).toBe('Created issue');
    // Two API calls: POST + GET
    expect(fetch).toHaveBeenCalledTimes(2);
    const getUrl = vi.mocked(fetch).mock.calls[1]![0] as string;
    expect(getUrl).toContain('issues/101');
  });

  it('returns minimal object when GET fallback fails (issue was already created)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ id: 102 })))
      .mockResolvedValueOnce(makeResponse(500, 'Server Error'));

    const result = await mockServer.callTool('create_issue', {
      summary: 'Test', project_id: 1, category: 'General',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { id: number };
    expect(parsed.id).toBe(102);
  });

  it('respects an explicitly passed severity', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 101, summary: 'Test' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Crash bug',
      project_id: 1,
      category: 'General',
      severity: 'crash',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.severity).toEqual({ name: 'crash' });
  });
});

// ---------------------------------------------------------------------------
// create_issue – handler username
// ---------------------------------------------------------------------------

describe('create_issue – handler username', () => {
  it('resolves handler username to id from cache and sets handler in body', async () => {
    const cache = makeStubCache([{ id: 7, name: 'dom' }, { id: 8, name: 'jane' }]);
    const server = new MockMcpServer();
    registerIssueTools(server as never, client, cache);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 200, summary: 'New issue', handler: { id: 7, name: 'dom' } } }))
    );

    await server.callTool('create_issue', {
      summary: 'Test', project_id: 1, category: 'General', handler: 'dom',
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as { handler: { id: number } };
    expect(body.handler).toEqual({ id: 7 });
  });

  it('resolves handler by real_name when name does not match', async () => {
    const cache = makeStubCache([{ id: 9, name: 'jdoe', real_name: 'John Doe' }]);
    const server = new MockMcpServer();
    registerIssueTools(server as never, client, cache);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 201, summary: 'New' } }))
    );

    await server.callTool('create_issue', {
      summary: 'Test', project_id: 1, category: 'General', handler: 'John Doe',
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as { handler: { id: number } };
    expect(body.handler).toEqual({ id: 9 });
  });

  it('fetches users from API when cache returns null', async () => {
    const cache = makeStubCache(); // returns null from loadIfValid
    const server = new MockMcpServer();
    registerIssueTools(server as never, client, cache);

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ users: [{ id: 42, name: 'alice' }] })))
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ issue: { id: 202, summary: 'New' } })));

    await server.callTool('create_issue', {
      summary: 'Test', project_id: 1, category: 'General', handler: 'alice',
    });

    const projectUsersCall = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(projectUsersCall).toContain('projects/1/users');

    const createBody = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string) as { handler: { id: number } };
    expect(createBody.handler).toEqual({ id: 42 });
  });

  it('returns error when handler username is not found', async () => {
    const cache = makeStubCache([{ id: 7, name: 'dom' }]);
    const server = new MockMcpServer();
    registerIssueTools(server as never, client, cache);

    const result = await server.callTool('create_issue', {
      summary: 'Test', project_id: 1, category: 'General', handler: 'nonexistent',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('nonexistent');
    expect(result.content[0]!.text).toContain('dom');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handler_id takes precedence over handler username', async () => {
    const cache = makeStubCache([{ id: 7, name: 'dom' }]);
    const server = new MockMcpServer();
    registerIssueTools(server as never, client, cache);

    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 203, summary: 'New' } }))
    );

    await server.callTool('create_issue', {
      summary: 'Test', project_id: 1, category: 'General', handler_id: 99, handler: 'dom',
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as { handler: { id: number } };
    expect(body.handler).toEqual({ id: 99 });
  });
});

// ---------------------------------------------------------------------------
// list_issues
// ---------------------------------------------------------------------------

describe('list_issues', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('list_issues')).toBe(true);
  });

  it('gibt Issues-Array zurück', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    const result = await mockServer.callTool('list_issues', { page: 1, page_size: 3 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: unknown[] };
    expect(Array.isArray(parsed.issues)).toBe(true);
  });

  it('übergibt project_id als Query-Parameter', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    await mockServer.callTool('list_issues', { project_id: 7, page: 1, page_size: 10 });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('project_id')).toBe('7');
  });

  it('passes select as query parameter', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    await mockServer.callTool('list_issues', { select: 'id,summary,status', page: 1, page_size: 10 });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('select')).toBe('id,summary,status');
  });

  it('status "open" filters to issues with status.id < 80', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    const result = await mockServer.callTool('list_issues', { status: 'open', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ status: { id: number } }> };
    expect(parsed.issues.length).toBeGreaterThan(0);
    parsed.issues.forEach(issue => {
      expect(issue.status.id).toBeLessThan(MANTIS_RESOLVED_STATUS_ID);
    });
  });

  it('status "resolved" filters to resolved issues only', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    const result = await mockServer.callTool('list_issues', { status: 'resolved', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ status: { name: string } }> };
    const resolvedInFixture = listIssuesFixture.issues.filter(i => i.status.name === 'resolved').length;
    expect(parsed.issues).toHaveLength(resolvedInFixture);
    parsed.issues.forEach(issue => {
      expect(issue.status.name).toBe('resolved');
    });
  });

  it('status "new" filters to new issues only', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    const result = await mockServer.callTool('list_issues', { status: 'new', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number; status: { name: string } }> };
    const newInFixture = listIssuesFixture.issues.filter(i => i.status.name === 'new');
    expect(parsed.issues).toHaveLength(newInFixture.length);
    if (newInFixture.length > 0) {
      expect(parsed.issues[0]!.id).toBe(newInFixture[0]!.id);
      expect(parsed.issues[0]!.status.name).toBe('new');
    }
  });

  it('assigned_to scans multiple API pages (small page_size does not miss results)', async () => {
    // Regression: previously fetched only page_size items from the API before filtering,
    // so assigned_to:X with page_size:1 returned 0 results when user's issue was not
    // in the first page returned by the server.
    // Now the tool always fetches API_PAGE_SIZE=50 internally when filters are active.
    const fixtureWithUser51: typeof listIssuesFixture = {
      ...listIssuesFixture,
      issues: [
        // first "slot" has a different user — previously this would have been the only
        // item fetched with page_size:1, causing a false empty result
        listIssuesFixture.issues.find(i => (i as { handler?: { id: number } }).handler?.id === 52)!,
        ...listIssuesFixture.issues.filter(i => (i as { handler?: { id: number } }).handler?.id === 51),
      ].filter(Boolean),
    };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(fixtureWithUser51)));

    const result = await mockServer.callTool('list_issues', { assigned_to: 51, page: 1, page_size: 1 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ handler: { id: number } }> };
    // Must find results for user 51 despite page_size:1
    expect(parsed.issues.length).toBeGreaterThan(0);
    parsed.issues.forEach(issue => expect(issue.handler.id).toBe(51));
  });

  it('assigned_to filters issues by handler.id (client-side)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    const result = await mockServer.callTool('list_issues', { assigned_to: 51, page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ handler: { id: number } }> };
    const expectedCount = listIssuesFixture.issues.filter(i => (i as { handler?: { id: number } }).handler?.id === 51).length;
    expect(parsed.issues).toHaveLength(expectedCount);
    parsed.issues.forEach(issue => {
      expect(issue.handler.id).toBe(51);
    });
  });

  it('assigned_to still sends the parameter to the API (server-side hint)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    await mockServer.callTool('list_issues', { assigned_to: 51, page: 1, page_size: 50 });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('assigned_to')).toBe('51');
  });

  it('reporter_id filters issues by reporter.id (client-side)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    const result = await mockServer.callTool('list_issues', { reporter_id: 52, page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ reporter: { id: number } }> };
    const expectedCount = listIssuesFixture.issues.filter(i => (i as { reporter?: { id: number } }).reporter?.id === 52).length;
    expect(parsed.issues).toHaveLength(expectedCount);
    parsed.issues.forEach(issue => {
      expect(issue.reporter.id).toBe(52);
    });
  });

  it('status filter is case-insensitive', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));
    const resultUpper = await mockServer.callTool('list_issues', { status: 'OPEN', page: 1, page_size: 50 });

    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));
    const resultLower = await mockServer.callTool('list_issues', { status: 'open', page: 1, page_size: 50 });

    const parsedUpper = JSON.parse(resultUpper.content[0]!.text) as { issues: unknown[] };
    const parsedLower = JSON.parse(resultLower.content[0]!.text) as { issues: unknown[] };
    expect(parsedUpper.issues.length).toBe(parsedLower.issues.length);
    expect(parsedUpper.issues).toEqual(parsedLower.issues);
  });
});

// ---------------------------------------------------------------------------
// list_issues – recorded fixtures
// ---------------------------------------------------------------------------

describe('list_issues – recorded fixtures', () => {
  it.skipIf(!recordedListIssuesFixture)('status "open" filter matches open issues in recorded fixture', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(recordedListIssuesFixture!)));

    const result = await mockServer.callTool('list_issues', { status: 'open', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: unknown[] };
    const openInFixture = recordedListIssuesFixture!.issues.filter(i => i.status.id < 80).length;
    expect(parsed.issues).toHaveLength(openInFixture);
  });

  it.skipIf(!recordedListIssuesFixture)('status "resolved" filter matches resolved issues in recorded fixture', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(recordedListIssuesFixture!)));

    const result = await mockServer.callTool('list_issues', { status: 'resolved', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: unknown[] };
    const resolvedInFixture = recordedListIssuesFixture!.issues.filter(i => i.status.id >= 80).length;
    expect(parsed.issues).toHaveLength(resolvedInFixture);
  });
});

// ---------------------------------------------------------------------------
// update_issue – fields allowlist
// ---------------------------------------------------------------------------

describe('update_issue – fields allowlist', () => {
  it('accepts known string fields (summary, description)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issue: { id: 1, summary: 'Updated' } })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { summary: 'Updated', description: 'New desc' } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });

  it('accepts known object fields (status, resolution, handler)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issue: { id: 1 } })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { status: { name: 'resolved' }, resolution: { id: 20 }, handler: { id: 5 } } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });

  it('rejects unknown fields without calling the API', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { reporter: { id: 99 } } },
      { validate: true },
    );

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects fields with an unknown key mixed with known keys without calling the API', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { summary: 'ok', unknown_field: 'bad' } },
      { validate: true },
    );

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
