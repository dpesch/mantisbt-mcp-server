import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { registerRelationshipTools } from '../../src/tools/relationships.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  registerRelationshipTools(mockServer as never, client);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// add_relationship
// ---------------------------------------------------------------------------

describe('add_relationship', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('add_relationship')).toBe(true);
  });

  it('posts to the correct endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 10 })));

    await mockServer.callTool('add_relationship', { issue_id: 42, target_id: 99, type_id: 1 });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('issues/42/relationships');
  });

  it('returns the API response', async () => {
    const apiResponse = { id: 10, issue: { id: 99, name: '#99' }, type: { id: 1, label: 'related_to' } };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(apiResponse)));

    const result = await mockServer.callTool('add_relationship', { issue_id: 42, target_id: 99, type_id: 1 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { id: number };
    expect(parsed.id).toBe(10);
  });

  it('returns isError on API error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(404, JSON.stringify({ message: 'Issue not found' })));

    const result = await mockServer.callTool('add_relationship', { issue_id: 999, target_id: 1, type_id: 0 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});

// ---------------------------------------------------------------------------
// remove_relationship
// ---------------------------------------------------------------------------

describe('remove_relationship', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('remove_relationship')).toBe(true);
  });

  it('sends DELETE to the correct endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    await mockServer.callTool('remove_relationship', { issue_id: 42, relationship_id: 7 });

    const call = vi.mocked(fetch).mock.calls[0]!;
    const calledUrl = call[0] as string;
    const options = call[1] as RequestInit;
    expect(calledUrl).toContain('issues/42/relationships/7');
    expect(options.method).toBe('DELETE');
  });

  it('returns { success: true } on 204', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    const result = await mockServer.callTool('remove_relationship', { issue_id: 42, relationship_id: 7 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it('returns isError on API error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(404, JSON.stringify({ message: 'Relationship not found' })));

    const result = await mockServer.callTool('remove_relationship', { issue_id: 42, relationship_id: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});
