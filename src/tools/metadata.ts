import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { MetadataCache, type CachedMetadata, type CachedProjectMeta } from '../cache.js';
import type { MantisProject, MantisUser, MantisVersion, MantisCategory, MantisPaginatedIssues } from '../types.js';
import { getVersionHint } from '../version-hint.js';

// Fields MantisBT strips from issue responses when the array is empty.
// They are always valid 'select' values even if absent in a sample issue.
const EMPTY_STRIPPED_FIELDS = [
  'attachments',
  'custom_fields',
  'history',
  'monitors',
  'notes',
  'relationships',
  'tags',
];

// Fallback static list used when no issues are available to sample.
const STATIC_ISSUE_FIELDS = [
  'additional_information',
  'attachments',
  'build',
  'category',
  'created_at',
  'custom_fields',
  'description',
  'due_date',
  'eta',
  'fixed_in_version',
  'handler',
  'history',
  'id',
  'monitors',
  'notes',
  'os',
  'os_build',
  'platform',
  'priority',
  'profile',
  'project',
  'projection',
  'relationships',
  'reporter',
  'reproducibility',
  'resolution',
  'severity',
  'status',
  'steps_to_reproduce',
  'sticky',
  'summary',
  'tags',
  'target_version',
  'updated_at',
  'version',
  'view_state',
];

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

async function fetchAndCacheMetadata(client: MantisClient, cache: MetadataCache): Promise<CachedMetadata> {
  // Fetch all projects
  const projectResult = await client.get<{ projects: MantisProject[] }>('projects');
  const projects = projectResult.projects ?? [];

  const byProject: Record<number, CachedProjectMeta> = {};

  // For each project, fetch users, versions, categories in parallel
  await Promise.all(
    projects.map(async (project) => {
      const [usersResult, versionsResult, categoriesResult] = await Promise.allSettled([
        client.get<{ users: MantisUser[] }>(`projects/${project.id}/users`),
        client.get<{ versions: MantisVersion[] }>(`projects/${project.id}/versions`),
        client.get<{ categories: MantisCategory[] }>(`projects/${project.id}/categories`),
      ]);

      const users: MantisUser[] = usersResult.status === 'fulfilled'
        ? (usersResult.value.users ?? [])
        : [];

      const versions: MantisVersion[] = versionsResult.status === 'fulfilled'
        ? (versionsResult.value.versions ?? [])
        : [];

      const ALL_PROJECTS_PREFIX = '[All Projects] ';
      const rawCategories: MantisCategory[] = categoriesResult.status === 'fulfilled'
        ? (categoriesResult.value.categories ?? (categoriesResult.value as unknown as MantisCategory[]))
        : [];
      const categories = Array.isArray(rawCategories)
        ? rawCategories.map((cat) => ({
            ...cat,
            name: cat.name.startsWith(ALL_PROJECTS_PREFIX)
              ? cat.name.slice(ALL_PROJECTS_PREFIX.length)
              : cat.name,
          }))
        : rawCategories;

      byProject[project.id] = { users, versions, categories };
    })
  );

  const data: CachedMetadata = {
    timestamp: Date.now(),
    projects,
    byProject,
  };

  await cache.save(data);
  return data;
}

export function registerMetadataTools(server: McpServer, client: MantisClient, cache: MetadataCache): void {

  // ---------------------------------------------------------------------------
  // sync_metadata
  // ---------------------------------------------------------------------------

  server.registerTool(
    'sync_metadata',
    {
      title: 'Sync Metadata Cache',
      description: `Fetch all projects and their associated users, versions, and categories from MantisBT and store them in the local metadata cache.

This is useful for getting a complete overview of your MantisBT installation.
The cache is valid for 1 hour by default (configurable via MANTIS_CACHE_TTL env var).
Use this tool to refresh stale data.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async () => {
      try {
        const data = await fetchAndCacheMetadata(client, cache);
        const projectCount = data.projects.length;
        const summary = data.projects.map((p) => {
          const meta = data.byProject[p.id];
          return `  - ${p.name} (ID ${p.id}): ${meta?.users.length ?? 0} users, ${meta?.versions.length ?? 0} versions, ${meta?.categories.length ?? 0} categories`;
        }).join('\n');

        return {
          content: [{
            type: 'text',
            text: `Metadata synced successfully.\n\n${projectCount} project(s):\n${summary}`,
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_metadata
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_metadata',
    {
      title: 'Get Cached Metadata',
      description: `Return cached MantisBT metadata (projects, users, versions, categories).

If the cache does not exist or has expired (default TTL: 24 hours), it will automatically sync first.
Use sync_metadata to force a refresh.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        let data: CachedMetadata | null = null;

        if (await cache.isValid()) {
          data = await cache.load();
        }

        if (!data) {
          data = await fetchAndCacheMetadata(client, cache);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_issue_fields
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issue_fields',
    {
      title: 'Get Issue Fields',
      description: `Return all field names that are valid for the "select" parameter of list_issues and get_issue.

Fields are discovered by fetching a sample issue from MantisBT (which reflects the server's active configuration — e.g. whether eta, projection, or profile fields are enabled) and merging the result with fields that MantisBT omits when empty (notes, attachments, relationships, etc.). The result is cached with the same TTL as the metadata cache.

Use this tool before constructing a "select" string to ensure you only request fields that exist on this server.`,
      inputSchema: z.object({
        project_id: z.number().int().positive().optional().describe('Optional project ID to scope the sample issue fetch'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id }) => {
      try {
        const cached = await cache.loadIssueFields();
        if (cached) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ fields: cached, source: 'cache' }, null, 2) }],
          };
        }

        const params: Record<string, string | number | boolean | undefined> = {
          page: 1,
          page_size: 1,
          project_id,
        };
        const result = await client.get<MantisPaginatedIssues>('issues', params);
        const issues = result.issues ?? [];

        let fields: string[];
        if (issues.length === 0) {
          fields = STATIC_ISSUE_FIELDS;
        } else {
          const discovered = Object.keys(issues[0]);
          fields = Array.from(new Set([...discovered, ...EMPTY_STRIPPED_FIELDS])).sort();
        }

        await cache.saveIssueFields(fields);
        return {
          content: [{ type: 'text', text: JSON.stringify({ fields, source: issues.length > 0 ? 'live' : 'static' }, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
