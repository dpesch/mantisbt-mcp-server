/**
 * Regression tests for string-to-number coercion in MCP tool schemas.
 *
 * The MCP protocol allows clients to pass numeric IDs as strings (e.g. "1940"
 * instead of 1940). Without z.coerce.number(), the Zod schema would reject
 * these inputs with error -32602 (Invalid params).
 *
 * These tests use { validate: true } to run args through the Zod schema —
 * exactly as the real MCP server does — before passing them to the handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { registerIssueTools } from '../../src/tools/issues.js';
import { MetadataCache } from '../../src/cache.js';
import { registerNoteTools } from '../../src/tools/notes.js';
import { registerFileTools } from '../../src/tools/files.js';
import { registerMonitorTools } from '../../src/tools/monitors.js';
import { registerRelationshipTools } from '../../src/tools/relationships.js';
import { registerTagTools } from '../../src/tools/tags.js';
import { registerProjectTools } from '../../src/tools/projects.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  const stubCache = { loadIfValid: vi.fn(async () => null) } as unknown as MetadataCache;
  registerIssueTools(mockServer as never, client, stubCache);
  registerNoteTools(mockServer as never, client);
  registerFileTools(mockServer as never, client);
  registerMonitorTools(mockServer as never, client);
  registerRelationshipTools(mockServer as never, client);
  registerTagTools(mockServer as never, client);
  registerProjectTools(mockServer as never, client);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

describe('string-coercion – get_issue', () => {
  it('accepts issue_id as string "1940"', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [{ id: 1940, summary: 'Test' }] }))
    );

    const result = await mockServer.callTool('get_issue', { id: '1940' }, { validate: true });

    expect(result.isError).toBeUndefined();
    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('1940');
  });

  it('rejects a non-numeric string', async () => {
    const result = await mockServer.callTool('get_issue', { id: 'abc' }, { validate: true });
    expect(result.isError).toBe(true);
  });
});

describe('string-coercion – list_issues', () => {
  it('accepts project_id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse(200, JSON.stringify({ issues: [], total_count: 0 }))
    );

    const result = await mockServer.callTool(
      'list_issues',
      { project_id: '5', page: '1', page_size: '10' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

describe('string-coercion – update_issue', () => {
  it('accepts id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issue: { id: 99, summary: 'Updated' } })));

    const result = await mockServer.callTool(
      'update_issue',
      { id: '99', fields: { summary: 'Updated' } },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

describe('string-coercion – delete_issue', () => {
  it('accepts id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    const result = await mockServer.callTool('delete_issue', { id: '42' }, { validate: true });

    expect(result.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

describe('string-coercion – list_notes', () => {
  it('accepts issue_id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ notes: [] }] })));

    const result = await mockServer.callTool('list_notes', { issue_id: '1940' }, { validate: true });

    expect(result.isError).toBeUndefined();
  });
});

describe('string-coercion – delete_note', () => {
  it('accepts issue_id and note_id as strings', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    const result = await mockServer.callTool(
      'delete_note',
      { issue_id: '1940', note_id: '77' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

describe('string-coercion – list_issue_files', () => {
  it('accepts issue_id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ attachments: [] }] })));

    const result = await mockServer.callTool('list_issue_files', { issue_id: '1940' }, { validate: true });

    expect(result.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Monitors
// ---------------------------------------------------------------------------

describe('string-coercion – add_monitor', () => {
  it('accepts issue_id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, ''));

    const result = await mockServer.callTool(
      'add_monitor',
      { issue_id: '1940', username: 'jdoe' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

describe('string-coercion – remove_monitor', () => {
  it('accepts issue_id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    const result = await mockServer.callTool(
      'remove_monitor',
      { issue_id: '1940', username: 'jdoe' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

describe('string-coercion – add_relationship', () => {
  it('accepts issue_id, target_id and type_id as strings', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 1 })));

    const result = await mockServer.callTool(
      'add_relationship',
      { issue_id: '1940', target_id: '1941', type_id: '1' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

describe('string-coercion – remove_relationship', () => {
  it('accepts issue_id and relationship_id as strings', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    const result = await mockServer.callTool(
      'remove_relationship',
      { issue_id: '1940', relationship_id: '55' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe('string-coercion – detach_tag', () => {
  it('accepts issue_id and tag_id as strings', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(204, ''));

    const result = await mockServer.callTool(
      'detach_tag',
      { issue_id: '1940', tag_id: '7' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('string-coercion – get_project_versions', () => {
  it('accepts project_id as string', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: [{ versions: [] }] })));

    const result = await mockServer.callTool(
      'get_project_versions',
      { project_id: '3' },
      { validate: true },
    );

    expect(result.isError).toBeUndefined();
  });
});
