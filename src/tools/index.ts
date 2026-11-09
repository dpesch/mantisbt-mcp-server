import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MantisClient } from '../client.js';
import type { MetadataCache } from '../cache.js';
import type { VersionHintService } from '../version-hint.js';
import type { SearchIndexStatus } from '../types.js';
import type { BuildInfo } from '../build-info.js';
import { registerIssueTools } from './issues.js';
import { registerNoteTools } from './notes.js';
import { registerFileTools } from './files.js';
import { registerRelationshipTools } from './relationships.js';
import { registerMonitorTools } from './monitors.js';
import { registerProjectTools } from './projects.js';
import { registerProjectVersionTools } from './project-versions.js';
import { registerUserTools } from './users.js';
import { registerFilterTools } from './filters.js';
import { registerConfigTools } from './config.js';
import { registerMetadataTools } from './metadata.js';
import { registerTagTools } from './tags.js';
import { registerVersionTools } from './version.js';

export interface ToolDeps {
  client: MantisClient;
  cache: MetadataCache;
  versionHint: VersionHintService;
  /** Version, commit and build time of this MCP server (see build-info.ts). */
  build: BuildInfo;
  uploadDir?: string;
  transport?: 'stdio' | 'http';
  /** Index status from the search module, if it runs (see get_metadata). */
  searchIndexStatus?: () => Promise<SearchIndexStatus>;
}

/**
 * Registers every tool except the optional search tools, which the search
 * module registers itself. Shared by createMcpServer and the test that checks
 * TOOL_GROUPS against the registered tools, so both see the same wiring.
 */
export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  const { client, cache } = deps;
  registerIssueTools(server, client, cache);
  registerNoteTools(server, client);
  registerFileTools(server, client, deps.uploadDir, deps.transport);
  registerRelationshipTools(server, client);
  registerMonitorTools(server, client);
  registerProjectTools(server, client, cache);
  registerProjectVersionTools(server, client, cache);
  registerUserTools(server, client);
  registerFilterTools(server, client);
  registerConfigTools(server, client, cache);
  registerMetadataTools(server, client, cache, deps.searchIndexStatus);
  registerTagTools(server, client);
  registerVersionTools(server, client, deps.versionHint, deps.build);
}
