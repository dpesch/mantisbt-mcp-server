import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { registerMonitorTools } from '../../src/tools/monitors.js';
import { MockMcpServer, makeResponse, monitorsResponse } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  registerMonitorTools(mockServer as never, client);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type Monitor = { id: number; name: string };

const JDOE: Monitor = { id: 7, name: 'jdoe' };
const ASMITH: Monitor = { id: 9, name: 'asmith' };
const AGENT: Monitor = { id: 51, name: 'agent' };

function parsed<T>(result: { content: Array<{ text: string }> }): T {
  return JSON.parse(result.content[0]!.text) as T;
}

// ---------------------------------------------------------------------------
// add_monitor
// ---------------------------------------------------------------------------

describe('add_monitor', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('add_monitor')).toBe(true);
  });

  // MantisBT reads only payload.users; without it, MonitorAddCommand adds the
  // logged-in user (the API-key owner) instead (see Mantis #8506).

  it('posts to the correct endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(monitorsResponse([JDOE], 201));

    await mockServer.callTool('add_monitor', { issue_id: 42, username: 'jdoe' });

    const call = vi.mocked(fetch).mock.calls[0]!;
    expect(call[0] as string).toContain('issues/42/monitors');
    expect((call[1] as RequestInit).method).toBe('POST');
  });

  it('sends the user in the "users" array MantisBT expects', async () => {
    vi.mocked(fetch).mockResolvedValue(monitorsResponse([JDOE], 201));

    await mockServer.callTool('add_monitor', { issue_id: 42, username: 'jdoe' });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(options.body as string)).toEqual({ users: [{ name: 'jdoe' }] });
  });

  it('returns success with the monitors from the POST response, without an extra request', async () => {
    vi.mocked(fetch).mockResolvedValue(monitorsResponse([AGENT, JDOE], 201));

    const result = await mockServer.callTool('add_monitor', { issue_id: 42, username: 'jdoe' });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
    expect(parsed(result)).toEqual({ success: true, monitors: ['agent', 'jdoe'] });
  });

  it('matches the username case-insensitively when checking the result', async () => {
    vi.mocked(fetch).mockResolvedValue(monitorsResponse([JDOE], 201));

    const result = await mockServer.callTool('add_monitor', { issue_id: 42, username: 'JDoe' });

    expect(result.isError).toBeUndefined();
  });

  it('returns isError when the user is not a monitor afterwards', async () => {
    vi.mocked(fetch).mockResolvedValue(monitorsResponse([AGENT], 201));

    const result = await mockServer.callTool('add_monitor', { issue_id: 42, username: 'jdoe' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('jdoe');
  });

  it('returns isError on API error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(400, JSON.stringify({ message: 'User not found' })));

    const result = await mockServer.callTool('add_monitor', { issue_id: 42, username: 'nobody' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});

// ---------------------------------------------------------------------------
// remove_monitor
// ---------------------------------------------------------------------------

// MantisBT 2.28 has no DELETE route for monitors. PATCH /issues/{id} treats
// "monitors" as the complete list, so removing means sending the list without
// the user (verified live against MantisBT 2.28.4, see Mantis #8496).

function mockGetThenPatch(before: Monitor[], after: Monitor[]): void {
  vi.mocked(fetch)
    .mockResolvedValueOnce(monitorsResponse(before))
    .mockResolvedValueOnce(monitorsResponse(after));
}

function patchBody(): unknown {
  const options = vi.mocked(fetch).mock.calls[1]![1] as RequestInit;
  return JSON.parse(options.body as string);
}

describe('remove_monitor', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('remove_monitor')).toBe(true);
  });

  it('reads the monitors, PATCHes the list without the user and reports the rest', async () => {
    mockGetThenPatch([JDOE, ASMITH], [ASMITH]);

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    // Exactly GET + PATCH — in particular no DELETE to the non-existent monitors route.
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0] as string).toContain('issues/42');
    expect((calls[0]![1] as RequestInit).method ?? 'GET').toBe('GET');
    expect(calls[1]![0] as string).toContain('issues/42');
    expect((calls[1]![1] as RequestInit).method).toBe('PATCH');
    expect(patchBody()).toEqual({ monitors: [{ id: 9 }] });

    expect(result.isError).toBeUndefined();
    expect(parsed(result)).toEqual({ success: true, removed: true, monitors: ['asmith'] });
  });

  it('requests only the monitors field when reading the issue', async () => {
    mockGetThenPatch([JDOE], []);

    await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string);
    expect(url.searchParams.get('select')).toBe('id,monitors');
  });

  it('matches the username case-insensitively', async () => {
    mockGetThenPatch([JDOE, ASMITH], [ASMITH]);

    await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'JDoe' });

    expect(patchBody()).toEqual({ monitors: [{ id: 9 }] });
  });

  it('sends an empty list when the user is the only monitor', async () => {
    mockGetThenPatch([JDOE], []);

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    expect(patchBody()).toEqual({ monitors: [] });
    expect(result.isError).toBeUndefined();
  });

  it('succeeds without PATCH when the user is not a monitor', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(monitorsResponse([ASMITH]));

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
    const body = parsed<{ success: boolean; removed: boolean; message: string }>(result);
    expect(body.success).toBe(true);
    expect(body.removed).toBe(false);
    expect(body.message).toContain('jdoe');
  });

  it('treats an issue without a monitors field as having no monitors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, JSON.stringify({ issues: [{ id: 42 }] })));

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(parsed<{ removed: boolean }>(result).removed).toBe(false);
  });

  it('returns isError when MantisBT silently keeps the user (missing permission)', async () => {
    mockGetThenPatch([JDOE, ASMITH], [JDOE, ASMITH]);

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('monitor_delete_others_bug_threshold');
  });

  it('returns isError when the issue cannot be read', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(404, JSON.stringify({ message: 'Issue #42 not found' })));

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });

  it('returns isError when the PATCH fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(monitorsResponse([JDOE]))
      .mockResolvedValueOnce(makeResponse(403, JSON.stringify({ message: 'Access denied' })));

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});

// ---------------------------------------------------------------------------
// Deprecation (#8499) – replaced by update_issue add_monitors / remove_monitors
// ---------------------------------------------------------------------------

describe('monitor tools – deprecation', () => {
  it.each([
    ['add_monitor', 'add_monitors'],
    ['remove_monitor', 'remove_monitors'],
  ])('%s is marked deprecated in favour of update_issue %s', (tool, param) => {
    const description = mockServer.toolDescription(tool);
    expect(description).toMatch(/^Deprecated:/);
    expect(description).toContain('update_issue');
    expect(description).toContain(param);
    expect(description).toContain('2.0.0');
  });
});
