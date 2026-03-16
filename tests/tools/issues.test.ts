import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../../src/client.js';
import { registerIssueTools } from '../../src/tools/issues.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';
import { MANTIS_RESOLVED_STATUS_ID } from '../../src/constants.js';

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
  registerIssueTools(mockServer as never, client);
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
    expect(parsed.issues.length).toBeGreaterThan(0);
    parsed.issues.forEach(issue => {
      expect(issue.status.name).toBe('resolved');
    });
  });

  it('status "new" filters to new issues only', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(listIssuesFixture)));

    const result = await mockServer.callTool('list_issues', { status: 'new', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number; status: { name: string } }> };
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]!.id).toBe(7901);
    expect(parsed.issues[0]!.status.name).toBe('new');
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
