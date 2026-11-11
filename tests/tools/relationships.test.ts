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
// add_relationship – type_name parameter
// ---------------------------------------------------------------------------

describe('add_relationship – type_name', () => {
  it('accepts "related_to" and sends type_id 1', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20, type_name: 'related_to' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { type: { id: number } };
    expect(body.type.id).toBe(1);
  });

  it('accepts "related-to" (dash variant) and sends type_id 1', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20, type_name: 'related-to' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { type: { id: number } };
    expect(body.type.id).toBe(1);
  });

  it('accepts "duplicate_of" and sends type_id 0', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20, type_name: 'duplicate_of' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { type: { id: number } };
    expect(body.type.id).toBe(0);
  });

  it('accepts "depends_on" as alias for parent_of (type_id 2)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20, type_name: 'depends_on' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { type: { id: number } };
    expect(body.type.id).toBe(2);
  });

  it('accepts "blocks" as alias for child_of (type_id 3)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20, type_name: 'blocks' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { type: { id: number } };
    expect(body.type.id).toBe(3);
  });

  it('type_id takes precedence when both type_id and type_name are given', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20, type_id: 4, type_name: 'related_to' });

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { type: { id: number } };
    expect(body.type.id).toBe(4);
  });

  it('returns error for unknown type_name', async () => {
    const result = await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20, type_name: 'nonsense' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('nonsense');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns error when neither type_id nor type_name is given', async () => {
    const result = await mockServer.callTool('add_relationship', { issue_id: 10, target_id: 20 });

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
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
