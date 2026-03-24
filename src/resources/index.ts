import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MantisClient } from '../client.js';
import { MetadataCache } from '../cache.js';
import type { MantisProject } from '../types.js';
import { fetchIssueEnums } from '../tools/config.js';

function jsonResource(uri: URL, data: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return {
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
  };
}

export function registerResources(server: McpServer, client: MantisClient, cache: MetadataCache): void {

  server.registerResource(
    'current-user',
    'mantis://me',
    {
      title: 'Current User',
      description: 'Profile of the user associated with the configured API key.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri, await client.get<unknown>('users/me')),
  );

  server.registerResource(
    'projects',
    'mantis://projects',
    {
      title: 'Projects',
      description: 'All MantisBT projects accessible to the current API user. Served from local cache when fresh; falls back to live fetch. Refresh via the sync_metadata tool.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const cached = await cache.loadIfValid();
      const projects: MantisProject[] = cached?.projects
        ?? (await client.get<{ projects: MantisProject[] }>('projects')).projects
        ?? [];
      return jsonResource(uri, projects);
    },
  );

  server.registerResource(
    'issue-enums',
    'mantis://enums',
    {
      title: 'Issue Enums',
      description: 'Valid values for issue enum fields: severity, priority, status, resolution, and reproducibility. Use these to look up IDs or names before creating or updating issues.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResource(uri, await fetchIssueEnums(client)),
  );
}
