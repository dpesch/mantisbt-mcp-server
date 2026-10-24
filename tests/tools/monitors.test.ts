import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { registerMonitorTools } from '../../src/tools/monitors.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

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
// add_monitor
// ---------------------------------------------------------------------------

describe('add_monitor', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('add_monitor')).toBe(true);
  });

  it('posts to the correct endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, ''));

    await mockServer.callTool('add_monitor', { issue_id: 42, username: 'jdoe' });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('issues/42/monitors');
  });

  it('sends the username in the request body', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, ''));

    await mockServer.callTool('add_monitor', { issue_id: 42, username: 'jdoe' });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(options.body as string) as { name: string };
    expect(body.name).toBe('jdoe');
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

describe('remove_monitor', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('remove_monitor')).toBe(true);
  });

  it('sends DELETE to the correct endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    const call = vi.mocked(fetch).mock.calls[0]!;
    const calledUrl = call[0] as string;
    const options = call[1] as RequestInit;
    expect(calledUrl).toContain('issues/42/monitors/jdoe');
    expect(options.method).toBe('DELETE');
  });

  it('returns { success: true } on 204', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'jdoe' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it('returns isError on API error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(404, JSON.stringify({ message: 'Monitor not found' })));

    const result = await mockServer.callTool('remove_monitor', { issue_id: 42, username: 'nobody' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});
