import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MantisClient } from '../client.js';
import { MetadataCache } from '../cache.js';
import type { MantisProject, MantisUser, MantisVersion, MantisCategory } from '../types.js';
import { fetchIssueEnums } from '../tools/config.js';
import { normalizeProject } from '../tools/metadata.js';
import { ALL_PROJECTS_PREFIX } from '../constants.js';

function jsonResource(uri: URL, data: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return {
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data) }],
  };
}

export function registerResources(server: McpServer, client: MantisClient, cache: MetadataCache, testEnvironment = false): void {

  async function loadProjects(): Promise<MantisProject[]> {
    const cached = await cache.loadIfValid();
    return cached?.projects
      ?? (await client.get<{ projects: MantisProject[] }>('projects')).projects?.map(normalizeProject)
      ?? [];
  }

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
    async (uri) => jsonResource(uri, await loadProjects()),
  );

  server.registerResource(
    'project-detail',
    new ResourceTemplate('mantis://projects/{id}', {
      list: async () => {
        // In test environments (MCP_TEST_ENVIRONMENT=true, e.g. Glama inspection
        // with placeholder credentials) skip the live API call and return an
        // empty list so resources/list responds immediately without timing out.
        if (testEnvironment) return { resources: [] };
        return {
          resources: (await loadProjects()).map((p) => ({
            uri: `mantis://projects/${p.id}`,
            name: p.name,
          })),
        };
      },
    }),
    {
      title: 'Project Detail',
      description: 'Combined project view: fields (status, view_state, access_level, description) plus all associated users, versions, and categories. Served from local cache when fresh; falls back to live API fetch. Refresh via the sync_metadata tool.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      const numId = Number(id);
      const cached = await cache.loadIfValid();

      let project: MantisProject | undefined;
      let users: MantisUser[];
      let versions: MantisVersion[];
      let categories: MantisCategory[];

      if (cached) {
        project = cached.projects.find((p) => p.id === numId);
        const meta = cached.byProject[numId];
        users = meta?.users ?? [];
        versions = meta?.versions ?? [];
        categories = meta?.categories ?? [];
      } else {
        const [projectResult, usersResult, versionsResult] = await Promise.all([
          client.get<{ projects: Array<MantisProject & { categories?: MantisCategory[] }> }>(`projects/${numId}`),
          client.get<{ users: MantisUser[] }>(`projects/${numId}/users`),
          client.get<{ versions: MantisVersion[] }>(`projects/${numId}/versions`, { obsolete: 1, inherit: 1 }),
        ]);
        const raw = projectResult.projects?.[0];
        project = raw ? normalizeProject(raw) : undefined;
        users = usersResult.users ?? [];
        versions = versionsResult.versions ?? [];
        categories = (raw?.categories ?? []).map((c) => ({
          ...c,
          name: c.name.startsWith(ALL_PROJECTS_PREFIX) ? c.name.slice(ALL_PROJECTS_PREFIX.length) : c.name,
        }));
      }

      if (!project) {
        throw new Error(`Project ${numId} not found`);
      }

      return jsonResource(uri, { ...project, users, versions, categories });
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
