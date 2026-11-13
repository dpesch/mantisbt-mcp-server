import { describe, it, expect, vi } from 'vitest';
import { MantisClient } from '../../src/client.js';
import type { MetadataCache } from '../../src/cache.js';
import { registerIssueTools } from '../../src/tools/issues.js';
import { registerNoteTools } from '../../src/tools/notes.js';
import { registerFileTools } from '../../src/tools/files.js';
import { registerProjectTools } from '../../src/tools/projects.js';
import { registerMetadataTools } from '../../src/tools/metadata.js';
import { registerConfigTools } from '../../src/tools/config.js';
import { registerVersionTools } from '../../src/tools/version.js';
import { registerUserTools } from '../../src/tools/users.js';
import { VersionHintService } from '../../src/version-hint.js';
import { MockMcpServer } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// Tools replaced by get_issue / get_project (#8497), removed in 2.0.0 (#8448)
// ---------------------------------------------------------------------------

describe('deprecated read tools (#8497)', () => {
  const mockServer = new MockMcpServer();
  const client = new MantisClient('https://mantis.example.com', 'test-token');
  const cache = { loadIfValid: vi.fn(async () => null) } as unknown as MetadataCache;
  registerIssueTools(mockServer as never, client, cache);
  registerNoteTools(mockServer as never, client);
  registerFileTools(mockServer as never, client);
  registerProjectTools(mockServer as never, client, cache);

  it.each([
    ['get_issues', 'get_issue with ids'],
    ['list_notes', 'get_issue with select: "notes"'],
    ['list_issue_files', 'get_issue with select: "attachments"'],
    ['get_project_categories', 'get_project with include: ["categories"]'],
    ['get_project_users', 'get_project with include: ["users"]'],
    ['get_project_versions', 'get_project with include: ["versions"]'],
    ['find_project_member', 'get_project with member_query'],
  ])('%s is marked deprecated and points to %s', (tool, replacement) => {
    const description = mockServer.toolDescription(tool);
    expect(description).toMatch(/^Deprecated: use /);
    expect(description).toContain(replacement);
    expect(description).toContain('will be removed in 2.0.0');
  });

  it.each(['get_issue', 'get_project'])('%s is not deprecated', (tool) => {
    expect(mockServer.toolDescription(tool)).not.toMatch(/Deprecated/);
  });
});

// ---------------------------------------------------------------------------
// Tools replaced by get_metadata / get_version / get_issue_schema /
// get_current_user (#8498), removed in 2.0.0 (#8448)
// ---------------------------------------------------------------------------

describe('deprecated metadata, version and schema tools (#8498)', () => {
  const mockServer = new MockMcpServer();
  const client = new MantisClient('https://mantis.example.com', 'test-token');
  const cache = { loadIfValid: vi.fn(async () => null) } as unknown as MetadataCache;
  registerMetadataTools(mockServer as never, client, cache);
  registerConfigTools(mockServer as never, client, cache);
  registerVersionTools(mockServer as never, client, new VersionHintService(), { version: '0.0.0-test' });
  registerUserTools(mockServer as never, client);

  it.each([
    ['get_metadata_full', 'get_metadata with detail: "full"'],
    ['sync_metadata', 'get_metadata with refresh: true'],
    ['get_mcp_version', 'get_version'],
    ['get_mantis_version', 'get_version'],
    ['get_issue_fields', 'get_issue_schema'],
    ['get_issue_enums', 'get_issue_schema'],
    ['list_languages', 'get_current_user (field "language")'],
  ])('%s is marked deprecated and points to %s', (tool, replacement) => {
    const description = mockServer.toolDescription(tool);
    expect(description).toMatch(/^Deprecated: use /);
    expect(description).toContain(replacement);
    expect(description).toContain('will be removed in 2.0.0');
  });

  it.each(['get_metadata', 'get_version', 'get_issue_schema', 'get_current_user'])('%s is not deprecated', (tool) => {
    expect(mockServer.toolDescription(tool)).not.toMatch(/Deprecated/);
  });

  it('get_current_user points at the language field', () => {
    expect(mockServer.toolDescription('get_current_user')).toContain('language');
  });
});
