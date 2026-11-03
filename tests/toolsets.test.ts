import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MantisClient } from '../src/client.js';
import type { MetadataCache } from '../src/cache.js';
import { VersionHintService } from '../src/version-hint.js';
import { registerAllTools } from '../src/tools/index.js';
import { registerSearchTools } from '../src/search/tools.js';
import { TOOLSETS, TOOL_GROUPS, parseToolsets, filterToolRegistration, type Toolset } from '../src/toolsets.js';
import { MockMcpServer } from './helpers/mock-server.js';
import { makeMockStore, makeMockEmbedder } from './helpers/search-mocks.js';

// ---------------------------------------------------------------------------
// MANTIS_TOOLSETS / MANTIS_DISABLE_DESTRUCTIVE (#8500)
// ---------------------------------------------------------------------------

/** Registers every tool the server can offer: the real wiring (registerAllTools) plus the search tools. */
function registerAll(server: unknown): void {
  const s = server as McpServer;
  const client = new MantisClient('https://mantis.example.com', 'test-token');
  const cache = { loadIfValid: vi.fn(async () => null) } as unknown as MetadataCache;
  registerAllTools(s, { client, cache, versionHint: new VersionHintService(), version: '0.0.0-test' });
  registerSearchTools(s, client, makeMockStore(), makeMockEmbedder());
}

function visibleTools(filter: { toolsets: ReadonlySet<Toolset>; disableDestructive: boolean }): string[] {
  const server = new MockMcpServer();
  registerAll(filterToolRegistration(server as unknown as McpServer, filter));
  return server.registeredToolNames().sort();
}

const ALL = new Set(TOOLSETS);

describe('TOOL_GROUPS', () => {
  it('assigns every registered tool to a group, and lists no tool that does not exist', () => {
    const server = new MockMcpServer();
    registerAll(server);
    const registered = server.registeredToolNames().sort();

    expect(registered.filter(name => !(name in TOOL_GROUPS))).toEqual([]);
    expect(Object.keys(TOOL_GROUPS).filter(name => !registered.includes(name))).toEqual([]);
  });

  it.each([
    ['list_notes', 'issues'],
    ['list_issue_files', 'issues'],
    ['add_monitor', 'issues'],
    ['release_version', 'versions'],
    ['find_project_member', 'projects'],
    ['get_search_index_status', 'meta'],
    ['list_languages', 'meta'],
  ])('puts the deprecated %s into the group of its replacement (%s)', (tool, group) => {
    expect(TOOL_GROUPS[tool]).toBe(group);
  });
});

describe('parseToolsets', () => {
  it.each([undefined, '', '   ', ' , '])('enables every group when MANTIS_TOOLSETS is %j', (raw) => {
    expect(parseToolsets(raw)).toEqual(ALL);
  });

  it('trims, ignores case and empty entries, tolerates duplicates', () => {
    expect(parseToolsets(' Issues, notes,,ISSUES ')).toEqual(new Set(['issues', 'notes']));
  });

  it('rejects an unknown group and names the valid ones', () => {
    expect(() => parseToolsets('issues,tickets')).toThrow(
      /Unknown MANTIS_TOOLSETS group "tickets".*issues, notes, links, files, projects, versions, meta, search/,
    );
  });
});

describe('filterToolRegistration', () => {
  it('hides nothing by default', () => {
    const server = new MockMcpServer();
    registerAll(server);

    expect(visibleTools({ toolsets: ALL, disableDestructive: false })).toEqual(server.registeredToolNames().sort());
  });

  it('registers only the tools of the selected groups', () => {
    const visible = visibleTools({ toolsets: new Set<Toolset>(['versions']), disableDestructive: false });

    expect(visible).toEqual(['create_version', 'delete_version', 'release_version', 'update_version']);
  });

  it('hides a deprecated tool together with the group of its replacement', () => {
    const visible = visibleTools({ toolsets: new Set<Toolset>(['notes']), disableDestructive: false });

    expect(visible).toContain('add_note');
    expect(visible).not.toContain('list_notes');
  });

  it('MANTIS_DISABLE_DESTRUCTIVE hides every tool with destructiveHint, whatever the group', () => {
    const visible = visibleTools({ toolsets: ALL, disableDestructive: true });

    for (const tool of ['delete_issue', 'delete_note', 'delete_version', 'remove_relationship', 'remove_monitor']) {
      expect(visible).not.toContain(tool);
    }
    expect(visible).toContain('update_issue');
  });

  it('passes everything except registerTool through to the real server', () => {
    const server = new MockMcpServer();
    const filtered = filterToolRegistration(server as never, { toolsets: ALL, disableDestructive: false });

    expect((filtered as unknown as MockMcpServer).toolDescription).toBe(server.toolDescription);
  });

  it('throws when a tool without a group is registered', () => {
    const filtered = filterToolRegistration(new MockMcpServer() as unknown as McpServer, { toolsets: ALL, disableDestructive: false });

    expect(() => filtered.registerTool('brand_new_tool', { description: 'x' } as never, (async () => ({ content: [] })) as never))
      .toThrow(/brand_new_tool.*TOOL_GROUPS/);
  });
});
