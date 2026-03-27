import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { MetadataCache, type CachedMetadata, type CachedProjectMeta } from '../cache.js';
import type { MantisProject, MantisIdName, MantisUser, MantisVersion, MantisCategory, MantisTag, MantisPaginatedIssues } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { ALL_PROJECTS_PREFIX } from '../constants.js';

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

async function collectTagsFromIssues(client: MantisClient, projects: MantisProject[]): Promise<MantisTag[]> {
  const tagMap = new Map<number, MantisTag>();
  const PAGE_SIZE = 50;

  for (const project of projects) {
    let page = 1;
    while (true) {
      const result = await client.get<MantisPaginatedIssues>('issues', {
        project_id: project.id,
        select: 'id,tags',
        page,
        page_size: PAGE_SIZE,
      });
      const issues = result.issues ?? [];
      for (const issue of issues) {
        for (const tag of (issue.tags ?? [])) {
          if (!tagMap.has(tag.id)) {
            tagMap.set(tag.id, { id: tag.id, name: tag.name });
          }
        }
      }
      if (issues.length < PAGE_SIZE) break;
      page++;
    }
  }

  return Array.from(tagMap.values()).sort((a, b) => a.id - b.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeIdName(o: any): MantisIdName {
  return { id: o.id, name: o.name, ...(o.label !== undefined && { label: o.label }) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeProject(p: any): MantisProject {
  return {
    id: p.id,
    name: p.name,
    ...(p.description !== undefined && { description: p.description }),
    ...(p.status !== undefined && { status: normalizeIdName(p.status) }),
    ...(p.enabled !== undefined && { enabled: p.enabled }),
    ...(p.view_state !== undefined && { view_state: normalizeIdName(p.view_state) }),
    ...(p.access_level !== undefined && { access_level: { id: p.access_level.id, label: p.access_level.label } }),
    ...(p.subprojects !== undefined && { subprojects: p.subprojects.map(normalizeProject) }),
  };
}

async function fetchAndCacheMetadata(client: MantisClient, cache: MetadataCache): Promise<CachedMetadata> {
  // Fetch all projects
  const projectResult = await client.get<{ projects: MantisProject[] }>('projects');
  const projects = (projectResult.projects ?? []).map(normalizeProject);

  const byProject: Record<number, CachedProjectMeta> = {};

  // For each project, fetch users, versions, categories in parallel
  await Promise.all(
    projects.map(async (project) => {
      const [usersResult, versionsResult, projectDetailResult] = await Promise.allSettled([
        client.get<{ users: MantisUser[] }>(`projects/${project.id}/users`),
        client.get<{ versions: MantisVersion[] }>(`projects/${project.id}/versions`, { obsolete: 1, inherit: 1 }),
        // Categories are embedded in the project detail response — same source as get_project_categories
        client.get<{ projects: Array<{ categories?: MantisCategory[] }> }>(`projects/${project.id}`),
      ]);

      const users: MantisUser[] = usersResult.status === 'fulfilled'
        ? (usersResult.value.users ?? [])
        : [];

      const versions: MantisVersion[] = versionsResult.status === 'fulfilled'
        ? (versionsResult.value.versions ?? [])
        : [];

      const rawCategories: MantisCategory[] = projectDetailResult.status === 'fulfilled'
        ? (projectDetailResult.value.projects?.[0]?.categories ?? [])
        : [];
      const categories = rawCategories.map((cat) => ({
        ...cat,
        name: cat.name.startsWith(ALL_PROJECTS_PREFIX)
          ? cat.name.slice(ALL_PROJECTS_PREFIX.length)
          : cat.name,
      }));

      byProject[project.id] = { users, versions, categories };
    })
  );

  // Fetch all tags — try the dedicated endpoint first, fall back to collecting
  // from issues when the endpoint is not available (e.g. MantisBT < 2.26)
  let tags: MantisTag[] = [];
  try {
    const tagsResult = await client.get<{ tags: MantisTag[] }>('tags');
    tags = tagsResult.tags ?? [];
  } catch {
    tags = await collectTagsFromIssues(client, projects);
  }

  const data: CachedMetadata = {
    timestamp: Date.now(),
    projects,
    byProject,
    tags,
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
      description: `Fetch all projects and their associated users, versions, categories, and tags from MantisBT and store them in the local metadata cache.

Tags are fetched via the dedicated GET /tags endpoint when available. On installations where that endpoint is missing (MantisBT < 2.26), tags are collected by scanning all issues across all projects.

This is useful for getting a complete overview of your MantisBT installation.
The cache is valid for 24 hours by default (configurable via MANTIS_CACHE_TTL env var).
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
            text: `Metadata synced successfully.\n\n${projectCount} project(s):\n${summary}\n\nGlobal tags: ${data.tags.length}`,
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
      description: `Return a compact summary of cached MantisBT metadata: project count, tag count, and per-project counts of users, versions, and categories.

If the cache does not exist or has expired (default TTL: 24 hours), it will automatically sync first.
Use sync_metadata to force a refresh. For full lists use: list_projects (projects), get_project_users / get_project_versions / get_project_categories (per-project data), list_tags (tags).`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const data: CachedMetadata = await cache.loadIfValid() ?? await fetchAndCacheMetadata(client, cache);

        const summary = {
          projects: data.projects.length,
          tags: data.tags.length,
          byProject: Object.fromEntries(
            data.projects.map((p) => {
              const meta = data.byProject[p.id];
              return [String(p.id), {
                name: p.name,
                users: meta?.users.length ?? 0,
                versions: meta?.versions.length ?? 0,
                categories: meta?.categories.length ?? 0,
              }];
            })
          ),
          cached_at: new Date(data.timestamp).toISOString(),
          ttl_seconds: cache.getRemainingTtlSeconds(data.timestamp),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_metadata_full
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_metadata_full',
    {
      title: 'Get Full Cached Metadata',
      description: `Return the complete raw MantisBT metadata cache: all projects with full fields, and per-project lists of users, versions, categories, plus all tags.

If the cache does not exist or has expired (default TTL: 24 hours), it will automatically sync first.
Use sync_metadata to force a refresh. For a lightweight overview use get_metadata instead.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const data: CachedMetadata = await cache.loadIfValid() ?? await fetchAndCacheMetadata(client, cache);
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
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
        project_id: z.coerce.number().int().positive().optional().describe('Optional project ID to scope the sample issue fetch'),
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
