import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../../src/client.js';
import { registerIssueTools } from '../../src/tools/issues.js';
import { MetadataCache } from '../../src/cache.js';
import { MockMcpServer, makeResponse, fetchCall, monitorsResponse } from '../helpers/mock-server.js';
import { MANTIS_RESOLVED_STATUS_ID } from '../../src/constants.js';
import { clearIssueEnumCache } from '../../src/tools/config.js';

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
  ? (JSON.parse(readFileSync(getIssueFixturePath, 'utf-8')) as { issues: Array<{ id: number; summary: string; notes?: Array<{ id: number }> }> })
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
  clearIssueEnumCache();
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

  it('enthält notes direkt in der Response (kein separater list_notes-Call nötig)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(getIssueFixture)));

    const result = await mockServer.callTool('get_issue', { id: getIssueFixture.issues[0]!.id });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { notes?: Array<{ id: number }> };
    const fixtureNotes = getIssueFixture.issues[0]!.notes!;
    expect(Array.isArray(parsed.notes)).toBe(true);
    expect(parsed.notes!.length).toBe(fixtureNotes.length);
    expect(parsed.notes![0]!.id).toBe(fixtureNotes[0]!.id);
  });
});

// ---------------------------------------------------------------------------
// get_issue with ids (#8497) — replaces get_issues
// ---------------------------------------------------------------------------

describe('get_issue – attachments', () => {
  it('adds download_url to each attachment, also with select: "attachments"', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({
      issues: [{ attachments: [{ id: 7, filename: 'log.txt', size: 10, content_type: 'text/plain' }] }],
    })));

    const result = await mockServer.callTool('get_issue', { id: 42, select: 'attachments' }, { validate: true });

    const parsed = JSON.parse(result.content[0]!.text) as { attachments: Array<{ id: number; download_url: string }> };
    expect(parsed.attachments[0]).toMatchObject({
      id: 7,
      download_url: 'https://mantis.example.com/file_download.php?file_id=7&type=bug',
    });
  });
});

describe('get_issue – ids', () => {
  type Envelope = { issues: Array<{ id: number; view_url?: string } | null>; requested: number; found: number; failed: number };

  it('fetches several issues and returns the get_issues envelope', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'A' }] })))
      .mockResolvedValueOnce(makeResponse(404, JSON.stringify({ message: 'Issue not found' })));

    const result = await mockServer.callTool('get_issue', { ids: [42, 9999] }, { validate: true });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Envelope;
    expect(parsed).toMatchObject({ requested: 2, found: 1, failed: 1 });
    expect(parsed.issues[0]?.id).toBe(42);
    expect(parsed.issues[1]).toBeNull();
  });

  it('keeps the envelope for a single-element ids list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42 }] })));

    const result = await mockServer.callTool('get_issue', { ids: [42] }, { validate: true });

    const parsed = JSON.parse(result.content[0]!.text) as Envelope;
    expect(parsed.requested).toBe(1);
    expect(parsed.issues).toHaveLength(1);
  });

  it('passes select to every request and keeps view_url when select omits id', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ summary: 'A' }] })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ summary: 'B' }] })));

    const result = await mockServer.callTool('get_issue', { ids: [42, 43], select: 'summary' }, { validate: true });

    expect(fetchCall(0).url).toContain('select=summary');
    expect(fetchCall(1).url).toContain('select=summary');
    const parsed = JSON.parse(result.content[0]!.text) as Envelope;
    expect(parsed.issues.map(i => i?.view_url)).toEqual([
      'https://mantis.example.com/view.php?id=42',
      'https://mantis.example.com/view.php?id=43',
    ]);
  });

  it.each([
    ['neither id nor ids', {}],
    ['both id and ids', { id: 42, ids: [43] }],
  ])('rejects %s without calling the API', async (_label, args) => {
    const result = await mockServer.callTool('get_issue', args, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('exactly one of');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects more than 50 ids', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    const result = await mockServer.callTool('get_issue', { ids }, { validate: true });

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// get_issues
// ---------------------------------------------------------------------------

describe('get_issues', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('get_issues')).toBe(true);
  });

  it('gibt ein Array von Issues zurück wenn alle IDs existieren', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Issue 42' }] })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 43, summary: 'Issue 43' }] })));

    const result = await mockServer.callTool('get_issues', { ids: [42, 43] });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      issues: Array<{ id: number } | null>;
      requested: number;
      found: number;
      failed: number;
    };
    expect(parsed.requested).toBe(2);
    expect(parsed.found).toBe(2);
    expect(parsed.failed).toBe(0);
    expect(parsed.issues[0]?.id).toBe(42);
    expect(parsed.issues[1]?.id).toBe(43);
  });

  it('gibt null für nicht gefundene IDs zurück ohne isError zu setzen', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Issue 42' }] })))
      .mockResolvedValueOnce(makeResponse(404, JSON.stringify({ message: 'Issue not found' })));

    const result = await mockServer.callTool('get_issues', { ids: [42, 9999] });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      issues: Array<{ id: number } | null>;
      found: number;
      failed: number;
    };
    expect(parsed.found).toBe(1);
    expect(parsed.failed).toBe(1);
    expect(parsed.issues[0]?.id).toBe(42);
    expect(parsed.issues[1]).toBeNull();
  });

  it('gibt isError nicht zurück auch wenn alle IDs fehlschlagen', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(404, JSON.stringify({ message: 'Not found' })),
    );

    const result = await mockServer.callTool('get_issues', { ids: [9001, 9002] });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      issues: Array<null>;
      found: number;
      failed: number;
    };
    expect(parsed.found).toBe(0);
    expect(parsed.failed).toBe(2);
    expect(parsed.issues).toEqual([null, null]);
  });

  it('erhält die Reihenfolge der Input-IDs im Ergebnis-Array', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 10, summary: 'A' }] })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 20, summary: 'B' }] })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 30, summary: 'C' }] })));

    const result = await mockServer.callTool('get_issues', { ids: [10, 20, 30] });

    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number }> };
    expect(parsed.issues.map((i) => i.id)).toEqual([10, 20, 30]);
  });

  it('validiert: leeres ids-Array wird abgelehnt', async () => {
    const result = await mockServer.callTool('get_issues', { ids: [] }, { validate: true });
    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('validiert: mehr als 50 IDs werden abgelehnt', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    const result = await mockServer.callTool('get_issues', { ids }, { validate: true });
    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('akzeptiert String-IDs via z.coerce', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Test' }] })),
    );

    const result = await mockServer.callTool('get_issues', { ids: ['42'] }, { validate: true });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number }> };
    expect(parsed.issues[0]?.id).toBe(42);
  });

  it('führt alle Requests aus (Concurrency-Nachweis mit 6 IDs)', async () => {
    Array.from({ length: 6 }, (_, i) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        makeResponse(200, JSON.stringify({ issues: [{ id: i + 1, summary: 'x' }] })),
      );
    });

    const result = await mockServer.callTool('get_issues', { ids: [1, 2, 3, 4, 5, 6] });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(6);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { requested: number };
    expect(parsed.requested).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// create_issue
// ---------------------------------------------------------------------------

describe('create_issue', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('create_issue')).toBe(true);
  });

  it('sends severity as { id: 50 } (minor) by default when no severity is provided', async () => {
    // Regression: omitting severity caused MantisBT to store 0 → displayed as "@0@".
    // The server now resolves canonical English names to IDs so MantisBT language setting
    // does not affect how the value is stored.
    // validate: true ensures Zod defaults are applied before the handler runs.
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 100, summary: 'Test' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Test issue',
      description: 'Test description.',
      project_id: 1,
      category: 'General',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.severity).toEqual({ id: 50 });
  });

  it('returns full issue object when API responds with complete issue', async () => {
    const fullIssue = { id: 100, summary: 'New issue', status: { id: 10, name: 'new' }, severity: { id: 50, name: 'minor' } };
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: fullIssue }))
    );

    const result = await mockServer.callTool('create_issue', {
      summary: 'New issue', description: 'New issue description.', project_id: 1, category: 'General',
    }, { validate: true });

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
      summary: 'Created issue', description: 'Created issue description.', project_id: 1, category: 'General',
    }, { validate: true });

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
      summary: 'Test', description: 'Test description.', project_id: 1, category: 'General',
    }, { validate: true });

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
      description: 'Crash bug description.',
      project_id: 1,
      category: 'General',
      severity: 'crash',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.severity).toEqual({ id: 70 });
  });

  it('returns a validation error when description is missing', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'Test',
      project_id: 1,
      category: 'General',
    }, { validate: true });

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a validation error when description is empty', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'Test',
      description: '',
      project_id: 1,
      category: 'General',
    }, { validate: true });

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an error for an unknown severity name', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'Test',
      description: 'Test description.',
      project_id: 1,
      category: 'General',
      severity: 'schwerer Fehler',
    }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('schwerer Fehler');
    expect(result.content[0]!.text).toContain('minor');
  });

  it('creates issue without any optional fields (backward compatibility)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 300, summary: 'Minimal' } }))
    );

    const result = await mockServer.callTool('create_issue', {
      summary: 'Minimal issue',
      description: 'Minimal description.',
      project_id: 1,
      category: 'General',
    }, { validate: true });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.version).toBeUndefined();
    expect(body.target_version).toBeUndefined();
    expect(body.fixed_in_version).toBeUndefined();
    expect(body.steps_to_reproduce).toBeUndefined();
    expect(body.additional_information).toBeUndefined();
    expect(body.reproducibility).toBeUndefined();
    expect(body.view_state).toBeUndefined();
  });

  it('sends version fields as { name } objects', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 301, summary: 'With versions' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Version test',
      description: 'Version test description.',
      project_id: 1,
      category: 'General',
      version: '1.0.0',
      target_version: '1.1.0',
      fixed_in_version: '1.0.1',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.version).toEqual({ name: '1.0.0' });
    expect(body.target_version).toEqual({ name: '1.1.0' });
    expect(body.fixed_in_version).toEqual({ name: '1.0.1' });
  });

  it('sends steps_to_reproduce and additional_information as plain strings', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 302, summary: 'With text fields' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Text fields test',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      steps_to_reproduce: '1. Open app\n2. Click button',
      additional_information: 'Happens only on Windows',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.steps_to_reproduce).toBe('1. Open app\n2. Click button');
    expect(body.additional_information).toBe('Happens only on Windows');
  });

  it('resolves reproducibility to { id } via enum lookup', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 303, summary: 'Reproducibility test' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Repro test',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      reproducibility: 'always',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.reproducibility).toEqual({ id: 10 });
  });

  it('returns error for unknown reproducibility name', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'Repro test',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      reproducibility: 'immer',
    }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('immer');
    expect(result.content[0]!.text).toContain('always');
  });

  it('returns error for empty reproducibility string', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'Repro test',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      reproducibility: '',
    }, { validate: true });

    expect(result.isError).toBe(true);
  });

  it('sends view_state as { name } object', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 304, summary: 'Private issue' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Private issue',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      view_state: 'private',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.view_state).toEqual({ name: 'private' });
  });

  it('rejects invalid view_state values', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'Test',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      view_state: 'restricted',
    }, { validate: true });

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends all new optional fields together in a single request', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 305, summary: 'Full issue' } }))
    );

    await mockServer.callTool('create_issue', {
      summary: 'Full issue',
      description: 'Full description.',
      project_id: 1,
      category: 'General',
      version: '2.0.0',
      target_version: '2.1.0',
      fixed_in_version: '2.0.1',
      steps_to_reproduce: 'Step 1',
      additional_information: 'Extra info',
      reproducibility: 'sometimes',
      view_state: 'public',
    }, { validate: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.version).toEqual({ name: '2.0.0' });
    expect(body.target_version).toEqual({ name: '2.1.0' });
    expect(body.fixed_in_version).toEqual({ name: '2.0.1' });
    expect(body.steps_to_reproduce).toBe('Step 1');
    expect(body.additional_information).toBe('Extra info');
    expect(body.reproducibility).toEqual({ id: 30 });
    expect(body.view_state).toEqual({ name: 'public' });
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
      summary: 'Test', description: 'Test description.', project_id: 1, category: 'General', handler: 'dom',
    }, { validate: true });

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
      summary: 'Test', description: 'Test description.', project_id: 1, category: 'General', handler: 'John Doe',
    }, { validate: true });

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
      summary: 'Test', description: 'Test description.', project_id: 1, category: 'General', handler: 'alice',
    }, { validate: true });

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
      summary: 'Test', description: 'Test description.', project_id: 1, category: 'General', handler: 'nonexistent',
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
      summary: 'Test', description: 'Test description.', project_id: 1, category: 'General', handler_id: 99, handler: 'dom',
    }, { validate: true });

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

  it('status canonical name matches by ID even when API returns localized status names', async () => {
    // Simulate a German MantisBT installation where issue.status.name is localized
    const localizedFixture = {
      issues: [
        { id: 1, status: { id: 10, name: 'Neu' } },
        { id: 2, status: { id: 80, name: 'Erledigt' } },
        { id: 3, status: { id: 10, name: 'Neu' } },
      ],
      total_count: 3,
    };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(localizedFixture)));

    const result = await mockServer.callTool('list_issues', { status: 'new', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number }> };
    expect(parsed.issues).toHaveLength(2);
    expect(parsed.issues.map(i => i.id)).toEqual([1, 3]);
  });

  it('status filter falls back to name comparison for non-canonical values', async () => {
    // "Neu" is not a canonical status name → falls back to name comparison
    const localizedFixture = {
      issues: [
        { id: 1, status: { id: 10, name: 'Neu' } },
        { id: 2, status: { id: 80, name: 'Erledigt' } },
      ],
      total_count: 2,
    };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(localizedFixture)));

    const result = await mockServer.callTool('list_issues', { status: 'Neu', page: 1, page_size: 50 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number }> };
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]!.id).toBe(1);
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
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ id: 1, summary: 'Updated' }] })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { summary: 'Updated', description: 'New desc' } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });

  it('accepts known object fields (status, resolution, handler)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })));

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

// ---------------------------------------------------------------------------
// update_issue – dry_run
// ---------------------------------------------------------------------------

describe('update_issue – dry_run', () => {
  it('returns preview payload without calling the API', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Preview title', status: { name: 'resolved' } }, dry_run: true },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    const parsed = JSON.parse(result.content[0]!.text) as { dry_run: boolean; id: number; would_patch: Record<string, unknown> };
    expect(parsed.dry_run).toBe(true);
    expect(parsed.id).toBe(42);
    expect(parsed.would_patch).toEqual({ summary: 'Preview title', status: { name: 'resolved' } });
  });

  it('defaults to false (normal update) when dry_run is omitted', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Updated' }] })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Updated' } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });

  it('also rejects unknown fields in dry_run mode without calling the API', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { unknown_field: 'bad' }, dry_run: true },
      { validate: true },
    );

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update_issue – enum resolution
// ---------------------------------------------------------------------------

describe('update_issue – enum resolution', () => {
  it('resolves canonical severity name to { id } before sending to API', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })),
    );

    await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { severity: { name: 'major' } } },
      { validate: true },
    );

    // Only one fetch call (the PATCH itself — canonical lookup needs no API call)
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.severity).toEqual({ id: 60 }); // major = id 60
  });

  it('resolves canonical priority name to { id } before sending to API', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })),
    );

    await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { priority: { name: 'high' } } },
      { validate: true },
    );

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.priority).toEqual({ id: 40 }); // high = id 40
  });

  it('resolves canonical status name to { id } before sending to API', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })),
    );

    await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { status: { name: 'resolved' } } },
      { validate: true },
    );

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.status).toEqual({ id: 80 }); // resolved = id 80
  });

  it('does not resolve when id is already provided', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })),
    );

    await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { severity: { id: 60 } } },
      { validate: true },
    );

    // Only one fetch call — no enum resolution needed
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.severity).toEqual({ id: 60 });
  });

  it('resolves localized enum name to { id } via live enum lookup', async () => {
    // First fetch: config endpoint for enum data
    // Second fetch: the actual PATCH
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({
        configs: [{
          option: 'severity_enum_string',
          value: [
            { id: 50, name: 'Kleiner Fehler' },
            { id: 60, name: 'Großer Fehler' },
          ],
        }],
      })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })));

    await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { severity: { name: 'Großer Fehler' } } },
      { validate: true },
    );

    // Call 0 = config endpoint, Call 1 = PATCH
    const patchBody = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string) as Record<string, unknown>;
    expect(patchBody.severity).toEqual({ id: 60 });
  });

  it('passes unknown enum name through unchanged when resolution fails', async () => {
    // Config returns no useful data → name stays unchanged
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ configs: [] })))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })));

    await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { severity: { name: 'völlig_unbekannt' } } },
      { validate: true },
    );

    const patchBody = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string) as Record<string, unknown>;
    expect(patchBody.severity).toEqual({ name: 'völlig_unbekannt' });
  });

  it('resolves multiple enum fields in one patch call', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })),
    );

    await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { status: { name: 'resolved' }, priority: { name: 'high' }, severity: { name: 'major' } } },
      { validate: true },
    );

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce(); // all canonical → single PATCH call
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.status).toEqual({ id: 80 });
    expect(body.priority).toEqual({ id: 40 });
    expect(body.severity).toEqual({ id: 60 });
  });
});

// ---------------------------------------------------------------------------
// list_issues – date filters
// ---------------------------------------------------------------------------

function makeIssuePage(issues: Array<{ id: number; updated_at: string; created_at: string }>) {
  return { issues, total_count: issues.length };
}

describe('list_issues – updated_after filter', () => {
  it('returns only issues updated after the given date', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(makeIssuePage([
      { id: 1, updated_at: '2026-03-26T10:00:00Z', created_at: '2026-03-01T00:00:00Z' },
      { id: 2, updated_at: '2026-03-23T10:00:00Z', created_at: '2026-03-01T00:00:00Z' },
      { id: 3, updated_at: '2026-03-25T00:00:01Z', created_at: '2026-03-01T00:00:00Z' },
    ]))));

    const result = await mockServer.callTool('list_issues', {
      updated_after: '2026-03-25T00:00:00Z',
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number }> };
    expect(parsed.issues.map(i => i.id)).toEqual([1, 3]);
  });

  it('returns an empty list when no issue matches', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(makeIssuePage([
      { id: 1, updated_at: '2026-03-20T00:00:00Z', created_at: '2026-03-01T00:00:00Z' },
    ]))));

    const result = await mockServer.callTool('list_issues', {
      updated_after: '2026-03-25T00:00:00Z',
    });

    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<unknown> };
    expect(parsed.issues).toHaveLength(0);
  });

  it('stops scanning pages when all issues in a batch are older than updated_after (early-exit)', async () => {
    // Page 1: one matching issue, one too old
    // Page 2: should NOT be fetched because the last item of page 1 is already older
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(makeIssuePage([
        { id: 10, updated_at: '2026-03-26T00:00:00Z', created_at: '2026-03-01T00:00:00Z' },
        { id: 9,  updated_at: '2026-03-20T00:00:00Z', created_at: '2026-03-01T00:00:00Z' },
      ]))))
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify(makeIssuePage([
        { id: 8, updated_at: '2026-03-18T00:00:00Z', created_at: '2026-03-01T00:00:00Z' },
      ]))));

    await mockServer.callTool('list_issues', {
      updated_after: '2026-03-25T00:00:00Z',
      page_size: 50,
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe('list_issues – created_after filter', () => {
  it('returns only issues created after the given date', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(makeIssuePage([
      { id: 1, updated_at: '2026-03-26T00:00:00Z', created_at: '2026-03-26T00:00:00Z' },
      { id: 2, updated_at: '2026-03-26T00:00:00Z', created_at: '2026-03-23T00:00:00Z' },
    ]))));

    const result = await mockServer.callTool('list_issues', {
      created_after: '2026-03-25T00:00:00Z',
    });

    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number }> };
    expect(parsed.issues.map(i => i.id)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// get_issue – select
// ---------------------------------------------------------------------------

describe('get_issue – select', () => {
  it('passes select as query parameter', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(getIssueFixture)));

    await mockServer.callTool('get_issue', { id: 42, select: 'id,summary,status' });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.get('select')).toBe('id,summary,status');
  });

  it('sends no select parameter when omitted (regression)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(getIssueFixture)));

    await mockServer.callTool('get_issue', { id: 42 });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const url = new URL(calledUrl);
    expect(url.searchParams.has('select')).toBe(false);
  });

  it('builds view_url from the input id when select excludes the id field', async () => {
    // Simulate a projection without "id": the response issue has no id field
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ summary: 'Projected issue' }] })),
    );

    const result = await mockServer.callTool('get_issue', { id: 42, select: 'summary,status' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { view_url: string };
    expect(parsed.view_url).toContain('42');
  });
});

// ---------------------------------------------------------------------------
// create_issue – custom_fields
// ---------------------------------------------------------------------------

describe('create_issue – custom_fields', () => {
  it('sends custom_fields in the POST body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 400, summary: 'CF issue' } })),
    );

    await mockServer.callTool('create_issue', {
      summary: 'CF issue',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      custom_fields: [{ field: { name: 'Kundennummer' }, value: 'K-1234' }],
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.custom_fields).toEqual([{ field: { name: 'Kundennummer' }, value: 'K-1234' }]);
  });

  it('rejects a custom field entry without value instead of sending "undefined" (regression)', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'CF issue',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      custom_fields: [{ field: { name: 'Kundennummer' } }],
    }, { validate: true });

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('omits custom_fields key when not provided (regression)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 401, summary: 'No CF' } })),
    );

    await mockServer.callTool('create_issue', {
      summary: 'No CF',
      description: 'Description.',
      project_id: 1,
      category: 'General',
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.custom_fields).toBeUndefined();
  });

  it('rejects a custom field entry without id and name', async () => {
    const result = await mockServer.callTool('create_issue', {
      summary: 'Bad CF',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      custom_fields: [{ field: {}, value: 'x' }],
    }, { validate: true });

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('coerces numeric custom field values to strings', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(201, JSON.stringify({ issue: { id: 402, summary: 'Numeric CF' } })),
    );

    await mockServer.callTool('create_issue', {
      summary: 'Numeric CF',
      description: 'Description.',
      project_id: 1,
      category: 'General',
      custom_fields: [{ field: { id: 3 }, value: 4711 }],
    }, { validate: true });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as { custom_fields: Array<{ value: unknown }> };
    expect(body.custom_fields[0]!.value).toBe('4711');
  });
});

// ---------------------------------------------------------------------------
// update_issue – custom_fields
// ---------------------------------------------------------------------------

describe('update_issue – custom_fields', () => {
  it('sends custom_fields in the PATCH body', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ id: 1 }] })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { custom_fields: [{ field: { id: 3 }, value: 'neu' }] } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.custom_fields).toEqual([{ field: { id: 3 }, value: 'neu' }]);
  });

  it('still rejects unknown fields (strict schema regression)', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 1, fields: { custom_field: [{ field: { id: 3 }, value: 'x' }] } },
      { validate: true },
    );

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// update_issue – note
// ---------------------------------------------------------------------------

describe('update_issue – note', () => {
  it('sends PATCH then POST notes and returns the note with view_url', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Updated' }] })))
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ note: { id: 7, text: 'Grund' } })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { status: { name: 'resolved' }, resolution: { id: 20 } }, note: 'Grund' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

    const patchUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(patchUrl).toContain('issues/42');
    const noteUrl = vi.mocked(fetch).mock.calls[1]![0] as string;
    expect(noteUrl).toContain('issues/42/notes');
    const noteBody = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string) as Record<string, unknown>;
    expect(noteBody.text).toBe('Grund');
    expect(noteBody.view_state).toEqual({ name: 'public' });

    const parsed = JSON.parse(result.content[0]!.text) as { note: { id: number; view_url: string } };
    expect(parsed.note.id).toBe(7);
    expect(parsed.note.view_url).toContain('42');
  });

  it('passes note_view_state "private" through to the note body', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42 }] })))
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ note: { id: 8, text: 'intern' } })));

    await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'x' }, note: 'intern', note_view_state: 'private' },
      { validate: true },
    );

    const noteBody = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string) as Record<string, unknown>;
    expect(noteBody.view_state).toEqual({ name: 'private' });
  });

  it('reports note_error without isError when the note fails after a successful PATCH', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Updated' }] })))
      .mockResolvedValueOnce(makeResponse(403, JSON.stringify({ message: 'Access denied' })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Updated' }, note: 'Grund' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { note_error?: string; note?: unknown };
    expect(parsed.note).toBeUndefined();
    expect(parsed.note_error).toContain('add_note');
  });

  it('does not post a note when the PATCH fails', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(404, JSON.stringify({ message: 'Issue not found' })),
    );

    const result = await mockServer.callTool(
      'update_issue',
      { id: 9999, fields: { summary: 'x' }, note: 'Grund' },
      { validate: true },
    );

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('dry_run makes no API calls and previews the note', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Preview' }, note: 'Grund', dry_run: true },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0]!.text) as { would_add_note: string | null };
    expect(parsed.would_add_note).toBe('Grund');
  });

  it('behaves unchanged without a note (single PATCH call, regression)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Updated' }] })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Updated' } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.content[0]!.text) as { note?: unknown; note_error?: unknown };
    expect(parsed.note).toBeUndefined();
    expect(parsed.note_error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// update_issue – PATCH response shape (#8511)
// MantisBT answers PATCH /issues/{id} with { issues: [issue] }, not { issue }.
// ---------------------------------------------------------------------------

describe('update_issue – PATCH response shape', () => {
  it('unwraps { issues: [issue] } and enriches the issue itself', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Updated' }] })),
    );

    const result = await mockServer.callTool('update_issue', { id: 42, fields: { summary: 'Updated' } }, { validate: true });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['issues']).toBeUndefined();
    expect(parsed['id']).toBe(42);
    expect(parsed['summary']).toBe('Updated');
    expect(parsed['view_url']).toContain('view.php?id=42');
  });

  it('removes monitors after a field update without an extra GET (monitor list from the PATCH response)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({
        issues: [{ id: 42, summary: 'Updated', monitors: [{ id: 7, name: 'jdoe' }, { id: 9, name: 'asmith' }] }],
      })))
      .mockResolvedValueOnce(monitorsResponse([{ id: 9, name: 'asmith' }]));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Updated' }, remove_monitors: ['jdoe'] },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(fetchCall(0)).toMatchObject({ method: 'PATCH', body: { summary: 'Updated' } });
    expect(fetchCall(1)).toMatchObject({ method: 'PATCH', body: { monitors: [{ id: 9 }] } });
    const parsed = JSON.parse(result.content[0]!.text) as { monitors: { removed: string[]; current: string[] } };
    expect(parsed.monitors.removed).toEqual(['jdoe']);
    expect(parsed.monitors.current).toEqual(['asmith']);
  });
});

// ---------------------------------------------------------------------------
// update_issue – edit notes via fields.notes (#8495)
// Edits keep the note's visibility unless view_state is given; note IDs that
// do not belong to the issue are rejected before writing.
// ---------------------------------------------------------------------------

describe('update_issue – fields.notes', () => {
  const PRIVATE = { id: 50, name: 'private', label: 'privat' };
  const PUBLIC = { id: 10, name: 'public', label: 'öffentlich' };
  const notesResponse = (notes: Array<{ id: number; text: string; view_state: typeof PRIVATE }>, extra: Record<string, unknown> = {}) =>
    makeResponse(200, JSON.stringify({ issues: [{ id: 42, ...extra, notes }] }));

  it('keeps the current view_state when only the text changes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PRIVATE }]))
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'new', view_state: PRIVATE }]));

    const result = await mockServer.callTool('update_issue', { id: 42, fields: { notes: [{ id: 5, text: 'new' }] } }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(fetchCall(0).method).toBe('GET');
    expect(fetchCall(0).url).toContain('select=id%2Cnotes');
    expect(fetchCall(1)).toMatchObject({ method: 'PATCH', body: { notes: [{ id: 5, text: 'new', view_state: { name: 'private' } }] } });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['notes_error']).toBeUndefined();
  });

  it('passes an explicit view_state through', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PRIVATE }]))
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PUBLIC }]));

    const result = await mockServer.callTool('update_issue', { id: 42, fields: { notes: [{ id: 5, view_state: 'public' }] } }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(fetchCall(1).body).toEqual({ notes: [{ id: 5, view_state: { name: 'public' } }] });
  });

  it('rejects a note ID that does not belong to the issue before writing anything', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PUBLIC }]));

    const result = await mockServer.callTool('update_issue', { id: 42, fields: { notes: [{ id: 99, text: 'x' }] } }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('99');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('returns isError when MantisBT did not apply the edit and no other field changed', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PUBLIC }]))
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PUBLIC }]));

    const result = await mockServer.callTool('update_issue', { id: 42, fields: { notes: [{ id: 5, text: 'new' }] } }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('note 5');
  });

  it('reports notes_error inline when other fields were updated', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PUBLIC }]))
      .mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PUBLIC }], { summary: 'Updated' }));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Updated', notes: [{ id: 5, text: 'new' }] } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { summary: string; notes_error: string };
    expect(parsed.summary).toBe('Updated');
    expect(parsed.notes_error).toContain('note 5');
  });

  it('dry_run shows the edit with the filled-in view_state without writing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(notesResponse([{ id: 5, text: 'old', view_state: PRIVATE }]));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { notes: [{ id: 5, text: 'new' }] }, dry_run: true },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(fetchCall(0).method).toBe('GET');
    const parsed = JSON.parse(result.content[0]!.text) as { would_patch: Record<string, unknown> };
    expect(parsed.would_patch).toEqual({ notes: [{ id: 5, text: 'new', view_state: { name: 'private' } }] });
  });

  it.each([
    ['without id (would create a new note)', { text: 'x' }, /notes.*id/s],
    ['with neither text nor view_state', { id: 5 }, /needs 'text' or 'view_state'/],
    ['with an unknown key', { id: 5, text: 'x', time_tracking: '0:10' }, /time_tracking/],
  ])('rejects a note edit %s without calling the API', async (_label, edit, message) => {
    const result = await mockServer.callTool('update_issue', { id: 42, fields: { notes: [edit] } }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(message);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects the same note ID listed twice without calling the API', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { notes: [{ id: 5, text: 'a' }, { id: 5, text: 'b' }] } },
      { validate: true },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('listed more than once');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  // #8622: one pass over the IDs; each duplicate is named once
  it('names each repeated note ID once', async () => {
    const notes = [5, 5, 5, 7, 9, 7].map(id => ({ id, text: 'x' }));

    const result = await mockServer.callTool('update_issue', { id: 42, fields: { notes } }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Note 5, 7 listed more than once');
  });
});

// ---------------------------------------------------------------------------
// update_issue – monitors (#8499): replacement for add_monitor / remove_monitor
// ---------------------------------------------------------------------------

describe('update_issue – monitors', () => {
  const JDOE = { id: 7, name: 'jdoe' };
  const ASMITH = { id: 9, name: 'asmith' };

  it('adds monitors without fields: one POST with the users array, no PATCH', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(monitorsResponse([JDOE, ASMITH], 201));

    const result = await mockServer.callTool('update_issue', { id: 42, add_monitors: ['jdoe', 'asmith'] }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(fetchCall(0)).toMatchObject({ method: 'POST', body: { users: [{ name: 'jdoe' }, { name: 'asmith' }] } });
    expect(fetchCall(0).url).toContain('issues/42/monitors');
    const parsed = JSON.parse(result.content[0]!.text) as { monitors: { added: string[]; current: string[] } };
    expect(parsed.monitors.added).toEqual(['jdoe', 'asmith']);
    expect(parsed.monitors.current).toEqual(['jdoe', 'asmith']);
  });

  it('removes monitors without fields via GET + PATCH of the monitor list', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(monitorsResponse([JDOE, ASMITH]))
      .mockResolvedValueOnce(monitorsResponse([ASMITH]));

    const result = await mockServer.callTool('update_issue', { id: 42, remove_monitors: ['jdoe'] }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(fetchCall(0).method).toBe('GET');
    expect(fetchCall(1)).toMatchObject({ method: 'PATCH', body: { monitors: [{ id: 9 }] } });
    const parsed = JSON.parse(result.content[0]!.text) as { monitors: { removed: string[]; current: string[] } };
    expect(parsed.monitors.removed).toEqual(['jdoe']);
    expect(parsed.monitors.current).toEqual(['asmith']);
  });

  it('patches the fields first, then changes the monitors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Updated' }] })))
      .mockResolvedValueOnce(monitorsResponse([JDOE], 201));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Updated' }, add_monitors: ['jdoe'] },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(fetchCall(0)).toMatchObject({ method: 'PATCH', body: { summary: 'Updated' } });
    expect(fetchCall(1).method).toBe('POST');
    const parsed = JSON.parse(result.content[0]!.text) as { summary: string; monitors: { added: string[] } };
    expect(parsed.summary).toBe('Updated');
    expect(parsed.monitors.added).toEqual(['jdoe']);
  });

  it('reports monitors_error inline (no isError) when monitors fail after a successful field update', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42, summary: 'Updated' }] })))
      .mockResolvedValueOnce(monitorsResponse([ASMITH], 201));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'Updated' }, add_monitors: ['jdoe'] },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { monitors_error: string };
    expect(parsed.monitors_error).toContain('jdoe');
  });

  it('returns isError when a monitor change fails and no field was updated', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(monitorsResponse([JDOE, ASMITH]))
      .mockResolvedValueOnce(monitorsResponse([JDOE, ASMITH]));

    const result = await mockServer.callTool('update_issue', { id: 42, remove_monitors: ['jdoe'] }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('monitor_delete_others_bug_threshold');
  });

  it('still posts the note when a monitor change fails after a field update', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42 }] })))
      .mockResolvedValueOnce(makeResponse(403, JSON.stringify({ message: 'Access denied' })))
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ note: { id: 8, text: 'Grund' } })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, fields: { summary: 'x' }, add_monitors: ['jdoe'], note: 'Grund' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(fetchCall(2).url).toContain('issues/42/notes');
    const parsed = JSON.parse(result.content[0]!.text) as { monitors_error: string; note: { id: number } };
    expect(parsed.monitors_error).toContain('Access denied');
    expect(parsed.note.id).toBe(8);
  });

  it('posts the note even when the monitor change fails without field update', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(403, JSON.stringify({ message: 'Access denied' })))
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ note: { id: 8, text: 'Grund' } })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, add_monitors: ['jdoe'], note: 'Grund' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { monitors_error: string; note: { id: number } };
    expect(parsed.note.id).toBe(8);
    expect(parsed.monitors_error).toContain('Access denied');
    expect(parsed.monitors_error).not.toContain('updated successfully');
  });

  it('returns isError when only a note is given and posting it fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(403, JSON.stringify({ message: 'Access denied' })));

    const result = await mockServer.callTool('update_issue', { id: 42, note: 'Grund' }, { validate: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).not.toContain('updated successfully');
    expect(result.content[0]!.text).toContain('Access denied');
  });

  it('removes after adding without an extra GET (monitor list known from the POST)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(monitorsResponse([JDOE, ASMITH], 201))
      .mockResolvedValueOnce(monitorsResponse([JDOE]));

    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, add_monitors: ['jdoe'], remove_monitors: ['asmith'] },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(fetchCall(1)).toMatchObject({ method: 'PATCH', body: { monitors: [{ id: 7 }] } });
  });

  it('rejects a user in both add_monitors and remove_monitors', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, add_monitors: ['jdoe'], remove_monitors: ['JDOE'] },
      { validate: true },
    );

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  // #8621: MANTIS_DISABLE_DESTRUCTIVE hides remove_monitor, so update_issue
  // must not offer the same removal through the back door.
  describe('with MANTIS_DISABLE_DESTRUCTIVE', () => {
    let guarded: MockMcpServer;
    beforeEach(() => {
      guarded = new MockMcpServer();
      registerIssueTools(guarded as never, client, makeStubCache(), { disableDestructive: true });
    });

    it.each([false, true])('rejects remove_monitors before any request (dry_run: %s)', async (dryRun) => {
      const result = await guarded.callTool(
        'update_issue',
        { id: 42, fields: { summary: 'Updated' }, remove_monitors: ['jdoe'], dry_run: dryRun },
        { validate: true },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('MANTIS_DISABLE_DESTRUCTIVE');
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('still adds monitors', async () => {
      const result = await guarded.callTool('update_issue', { id: 42, add_monitors: ['jdoe'], dry_run: true }, { validate: true });

      expect(result.isError).toBeUndefined();
    });
  });

  it('rejects a call with nothing to change', async () => {
    const result = await mockServer.callTool('update_issue', { id: 42 }, { validate: true });

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('dry_run previews the monitor changes without API calls', async () => {
    const result = await mockServer.callTool(
      'update_issue',
      { id: 42, add_monitors: ['jdoe'], remove_monitors: ['asmith'], dry_run: true },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0]!.text) as { would_add_monitors: string[]; would_remove_monitors: string[] };
    expect(parsed.would_add_monitors).toEqual(['jdoe']);
    expect(parsed.would_remove_monitors).toEqual(['asmith']);
  });
});

describe('list_issues – combined date window', () => {
  it('returns only issues within the updated_after + updated_before window', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(makeIssuePage([
      { id: 1, updated_at: '2026-03-22T00:00:00Z', created_at: '2026-03-01T00:00:00Z' }, // in window
      { id: 2, updated_at: '2026-03-19T00:00:00Z', created_at: '2026-03-01T00:00:00Z' }, // too old
      { id: 3, updated_at: '2026-03-26T00:00:00Z', created_at: '2026-03-01T00:00:00Z' }, // too new
    ]))));

    const result = await mockServer.callTool('list_issues', {
      updated_after:  '2026-03-20T00:00:00Z',
      updated_before: '2026-03-25T00:00:00Z',
    });

    const parsed = JSON.parse(result.content[0]!.text) as { issues: Array<{ id: number }> };
    expect(parsed.issues.map(i => i.id)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// list_issues – group_by (#8492)
// Counts per group instead of an issue list; scans all pages server-side.
// ---------------------------------------------------------------------------

describe('list_issues – group_by', () => {
  const NEW = { id: 10, name: 'new', label: 'neu' };
  const RESOLVED = { id: 80, name: 'resolved', label: 'erledigt' };
  const DOM = { id: 2, name: 'dom' };
  const ANNA = { id: 7, name: 'anna' };

  /** Serves the given issues in API pages of the requested page_size. */
  function serveIssues(issues: Array<Record<string, unknown>>): void {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      const size = Number(url.searchParams.get('page_size'));
      const page = Number(url.searchParams.get('page'));
      return makeResponse(200, JSON.stringify({ issues: issues.slice((page - 1) * size, page * size) }));
    });
  }
  const parse = (r: { content: Array<{ text: string }> }) =>
    JSON.parse(r.content[0]!.text) as { group_by: string; total: number; truncated?: boolean; groups: Array<{ id: number | null; name: string; label?: string; count: number }> };

  it('counts issues per status, sorted by count, with one narrow request per 1000 issues', async () => {
    serveIssues([
      { id: 1, status: NEW }, { id: 2, status: RESOLVED }, { id: 3, status: RESOLVED },
    ]);

    const result = await mockServer.callTool('list_issues', { project_id: 57, group_by: 'status' }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(parse(result)).toEqual({
      group_by: 'status',
      total: 3,
      groups: [
        { id: 80, name: 'resolved', label: 'erledigt', count: 2 },
        { id: 10, name: 'new', label: 'neu', count: 1 },
      ],
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const url = new URL(fetchCall(0).url);
    expect(url.searchParams.get('page_size')).toBe('1000');
    expect(url.searchParams.get('project_id')).toBe('57');
    expect(url.searchParams.get('select')!.split(',')).toEqual(expect.arrayContaining(['id', 'status']));
  });

  it('groups by handler and puts issues without handler under "(unassigned)"', async () => {
    serveIssues([{ id: 1, handler: DOM }, { id: 2, handler: DOM }, { id: 3 }]);

    const result = await mockServer.callTool('list_issues', { group_by: 'handler' }, { validate: true });

    expect(parse(result).groups).toEqual([
      { id: 2, name: 'dom', count: 2 },
      { id: null, name: '(unassigned)', count: 1 },
    ]);
  });

  it('applies the client-side filters before counting', async () => {
    serveIssues([
      { id: 1, status: NEW, handler: DOM }, { id: 2, status: RESOLVED, handler: DOM },
      { id: 3, status: NEW, handler: ANNA },
    ]);

    const result = await mockServer.callTool('list_issues', { group_by: 'status', assigned_to: 2, status: 'open' }, { validate: true });

    expect(parse(result)).toMatchObject({ total: 1, groups: [{ name: 'new', count: 1 }] });
    const select = new URL(fetchCall(0).url).searchParams.get('select')!.split(',');
    expect(select).toEqual(expect.arrayContaining(['status', 'handler']));
  });

  it('scans every page until a short one', async () => {
    serveIssues(Array.from({ length: 1003 }, (_, i) => ({ id: i + 1, priority: { id: 30, name: 'normal' } })));

    const result = await mockServer.callTool('list_issues', { group_by: 'priority' }, { validate: true });

    expect(parse(result)).toMatchObject({ total: 1003, groups: [{ name: 'normal', count: 1003 }] });
    expect(parse(result)).not.toHaveProperty('truncated');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('reports truncated instead of silently counting too few when the scan cap is hit', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      makeResponse(200, JSON.stringify({ issues: Array.from({ length: 1000 }, (_, i) => ({ id: i, category: { id: 1, name: 'API' } })) })));

    const result = await mockServer.callTool('list_issues', { group_by: 'category' }, { validate: true });

    expect(parse(result)).toMatchObject({ truncated: true, total: 50_000, groups: [{ name: 'API', count: 50_000 }] });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(50);
  });

  it('rejects an unknown group_by value', async () => {
    const result = await mockServer.callTool('list_issues', { group_by: 'reporter' }, { validate: true });

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// list_issues – filtered listing reports its scan limit (#8492)
// ---------------------------------------------------------------------------

describe('list_issues – truncated', () => {
  const page = (statusId: number) => makeResponse(200, JSON.stringify({
    issues: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, status: { id: statusId, name: statusId === 10 ? 'new' : 'closed' } })),
  }));

  it('says truncated when the 500-issue scan limit ends the search early', async () => {
    vi.mocked(fetch).mockImplementation(async () => page(90));

    const result = await mockServer.callTool('list_issues', { status: 'new' }, { validate: true });

    expect(JSON.parse(result.content[0]!.text)).toEqual({ issues: [], truncated: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(10);
  });

  it('does not say truncated when enough matches were found', async () => {
    vi.mocked(fetch).mockImplementation(async () => page(10));

    const result = await mockServer.callTool('list_issues', { status: 'new', page_size: 20 }, { validate: true });

    const parsed = JSON.parse(result.content[0]!.text) as { issues: unknown[]; truncated?: boolean };
    expect(parsed.issues).toHaveLength(20);
    expect(parsed).not.toHaveProperty('truncated');
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// list_issues – client-side filters with a narrow select (#8597)
// The filters must see their field even when the caller's select omits it,
// and the caller must still get exactly the fields they selected.
// ---------------------------------------------------------------------------

describe('list_issues – filters with a narrow select', () => {
  const ISSUES: Array<Record<string, unknown>> = [
    {
      id: 1, summary: 'open, dom, recent',
      status: { id: 10, name: 'new' }, handler: { id: 2, name: 'dom' }, reporter: { id: 51, name: 'domAgent' },
      created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-08T00:00:00Z',
    },
    {
      id: 2, summary: 'resolved, other, old',
      status: { id: 80, name: 'resolved' }, handler: { id: 7, name: 'anna' }, reporter: { id: 7, name: 'anna' },
      created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
    },
  ];

  /** Serves ISSUES projected like MantisBT: flat, trimmed top-level field names. */
  function serveProjected(): void {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const select = new URL(String(input)).searchParams.get('select');
      const fields = select === null ? null : select.split(',').map(f => f.trim());
      const issues = ISSUES.map(issue => fields === null
        ? issue
        : Object.fromEntries(Object.entries(issue).filter(([key]) => fields.includes(key))));
      return makeResponse(200, JSON.stringify({ issues }));
    });
  }

  const parse = (r: { content: Array<{ text: string }> }) =>
    JSON.parse(r.content[0]!.text) as { issues: Array<Record<string, unknown>> };

  it.each([
    ['status', { status: 'open' }],
    ['assigned_to', { assigned_to: 2 }],
    ['reporter_id', { reporter_id: 51 }],
    ['updated_after', { updated_after: '2026-11-01T00:00:00Z' }],
    ['updated_before', { updated_before: '2026-10-15T00:00:00Z' }],
    ['created_after', { created_after: '2026-11-01T00:00:00Z' }],
    ['created_before', { created_before: '2026-10-15T00:00:00Z' }],
  ])('filters by %s although select omits its field', async (_name, filterArgs) => {
    serveProjected();

    const result = await mockServer.callTool('list_issues', { select: 'id', ...filterArgs }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(parse(result).issues).toHaveLength(1);
  });

  it('returns only the selected fields, not the ones fetched for filtering', async () => {
    serveProjected();

    const result = await mockServer.callTool('list_issues', {
      select: 'id,summary', status: 'open', assigned_to: 2, updated_after: '2026-11-01T00:00:00Z',
    }, { validate: true });

    const [issue] = parse(result).issues;
    expect(issue).toEqual({
      id: 1,
      summary: 'open, dom, recent',
      view_url: 'https://mantis.example.com/view.php?id=1',
    });
  });

  it('keeps a filter field the caller selected', async () => {
    serveProjected();

    const result = await mockServer.callTool('list_issues', { select: 'id, status', status: 'open' }, { validate: true });

    expect(parse(result).issues[0]).toMatchObject({ id: 1, status: { id: 10, name: 'new' } });
  });

  it('adds the filter fields to the select sent to MantisBT', async () => {
    serveProjected();

    await mockServer.callTool('list_issues', { select: 'id', status: 'open', reporter_id: 51 }, { validate: true });

    const select = new URL(fetchCall(0).url).searchParams.get('select')!.split(',');
    expect(select).toEqual(expect.arrayContaining(['id', 'status', 'reporter']));
  });

  it('leaves the select untouched without client-side filters', async () => {
    serveProjected();

    await mockServer.callTool('list_issues', { select: 'id,summary' }, { validate: true });

    expect(new URL(fetchCall(0).url).searchParams.get('select')).toBe('id,summary');
  });
});

// ---------------------------------------------------------------------------
// update_issue / create_issue – response: "short" (#8598)
// "short" returns what confirms the change instead of the whole issue with
// description, notes and history. "full" stays the default until 2.0.0.
// ---------------------------------------------------------------------------

describe('update_issue / create_issue – response "short"', () => {
  const RESOLVED = { id: 80, name: 'resolved', label: 'erledigt' };
  const FIXED = { id: 20, name: 'fixed', label: 'erledigt' };
  const PUBLIC = { id: 10, name: 'public', label: 'öffentlich' };
  const FULL_ISSUE = {
    id: 42,
    summary: 'Something broke',
    description: 'A long description '.repeat(50),
    project: { id: 57, name: 'mcp' },
    category: { id: 369, name: 'API' },
    status: RESOLVED,
    resolution: FIXED,
    priority: { id: 30, name: 'normal' },
    handler: { id: 2, name: 'dom' },
    created_at: '2026-11-01T10:00:00+01:00',
    updated_at: '2026-11-09T12:00:00+01:00',
    custom_fields: [
      { field: { id: 10, name: 'Wiedervorlage' }, value: '1767222000' },
      { field: { id: 11, name: 'Kunde' }, value: 'ACME' },
    ],
    notes: [
      { id: 5, text: 'old note '.repeat(40), view_state: PUBLIC },
      { id: 6, text: 'another note', view_state: PUBLIC },
    ],
    history: [{ created_at: '2026-11-01T10:00:00+01:00', type: { id: 1, name: 'issue-new' } }],
  };
  const issueResponse = (status = 200) => makeResponse(status, JSON.stringify({ issues: [FULL_ISSUE] }));
  const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0]!.text) as Record<string, unknown>;

  it('update_issue keeps returning the full issue by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(issueResponse());

    const result = await mockServer.callTool('update_issue', { id: 42, fields: { status: { name: 'resolved' } } }, { validate: true });

    expect(parse(result)).toMatchObject({ description: FULL_ISSUE.description, history: FULL_ISSUE.history });
  });

  it('update_issue with "short" returns the core fields plus the changed ones', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(issueResponse());

    const result = await mockServer.callTool('update_issue', {
      id: 42, fields: { status: { name: 'resolved' }, resolution: { id: 20 }, handler: { id: 2 } }, response: 'short',
    }, { validate: true });

    expect(parse(result)).toEqual({
      id: 42,
      summary: 'Something broke',
      status: RESOLVED,
      resolution: FIXED,
      handler: { id: 2, name: 'dom' },
      updated_at: '2026-11-09T12:00:00+01:00',
      view_url: 'https://mantis.example.com/view.php?id=42',
    });
  });

  it('update_issue with "short" lists only the changed custom fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(issueResponse());

    const result = await mockServer.callTool('update_issue', {
      id: 42, fields: { custom_fields: [{ field: { name: 'Wiedervorlage' }, value: '1767222000' }] }, response: 'short',
    }, { validate: true });

    expect(parse(result)['custom_fields']).toEqual([{ field: { id: 10, name: 'Wiedervorlage' }, value: '1767222000' }]);
  });

  it('update_issue with "short" lists only the edited notes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(issueResponse()) // current notes
      .mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ ...FULL_ISSUE, notes: [FULL_ISSUE.notes[0], { ...FULL_ISSUE.notes[1], text: 'edited' }] }] })));

    const result = await mockServer.callTool('update_issue', {
      id: 42, fields: { notes: [{ id: 6, text: 'edited' }] }, response: 'short',
    }, { validate: true });

    expect(parse(result)['notes']).toEqual([
      { id: 6, text: 'edited', view_state: PUBLIC, view_url: 'https://mantis.example.com/view.php?id=42#bugnote6' },
    ]);
  });

  it('update_issue with "short" reduces the appended note to id and view_url', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(issueResponse())
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ note: { id: 7, text: 'Grund '.repeat(30), view_state: PUBLIC } })));

    const result = await mockServer.callTool('update_issue', {
      id: 42, fields: { status: { name: 'resolved' } }, note: 'Grund', response: 'short',
    }, { validate: true });

    expect(parse(result)['note']).toEqual({ id: 7, view_url: 'https://mantis.example.com/view.php?id=42#bugnote7' });
  });

  it('create_issue with "short" returns the core fields of the new issue', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(201, JSON.stringify({ issue: { ...FULL_ISSUE, status: { id: 10, name: 'new' } } })));

    const result = await mockServer.callTool('create_issue', {
      summary: 'Something broke', description: 'x', project_id: 57, category: 'API', response: 'short',
    }, { validate: true });

    expect(parse(result)).toEqual({
      id: 42,
      summary: 'Something broke',
      project: { id: 57, name: 'mcp' },
      category: { id: 369, name: 'API' },
      status: { id: 10, name: 'new' },
      handler: { id: 2, name: 'dom' },
      created_at: '2026-11-01T10:00:00+01:00',
      view_url: 'https://mantis.example.com/view.php?id=42',
    });
  });

  it('create_issue with "short" fetches only the short fields when MantisBT returns just the id', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(201, JSON.stringify({ issue: { id: 42 } })))
      .mockResolvedValueOnce(issueResponse());

    await mockServer.callTool('create_issue', {
      summary: 'Something broke', description: 'x', project_id: 57, category: 'API', response: 'short',
    }, { validate: true });

    expect(fetchCall(1).method).toBe('GET');
    expect(new URL(fetchCall(1).url).searchParams.get('select')).toBe('id,summary,project,category,status,handler,created_at');
  });

  it('create_issue keeps returning the full issue by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(201, JSON.stringify({ issue: FULL_ISSUE })));

    const result = await mockServer.callTool('create_issue', {
      summary: 'Something broke', description: 'x', project_id: 57, category: 'API',
    }, { validate: true });

    expect(parse(result)).toMatchObject({ description: FULL_ISSUE.description, notes: expect.any(Array) });
  });

  it('rejects an unknown response value', async () => {
    const result = await mockServer.callTool('update_issue', { id: 42, fields: { summary: 'x' }, response: 'long' }, { validate: true });

    expect(result.isError).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
