import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../../src/client.js';
import { registerIssueTools } from '../../src/tools/issues.js';
import { MockMcpServer } from '../helpers/mock-server.js';

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
  ? (JSON.parse(readFileSync(listIssuesFixturePath, 'utf-8')) as { issues: Array<{ id: number; summary: string }>; total_count: number })
  : { issues: [{ id: 42, summary: 'Test Issue' }], total_count: 1 };

// ---------------------------------------------------------------------------
// Helper: minimale Response nachbauen
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
});
