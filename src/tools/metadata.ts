import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { coerceBool } from '../coerce.js';
import { MantisClient } from '../client.js';
import { MetadataCache, type CachedMetadata, type CachedProjectMeta } from '../cache.js';
import type { MantisProject, MantisIdName, MantisUser, MantisVersion, MantisCategory, MantisTag, MantisPaginatedIssues } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { ALL_PROJECTS_PREFIX } from '../constants.js';
import { deprecationNote } from '../deprecation.js';
import type { SearchIndexStatus } from '../types.js';
import { fetchIssueEnumsWithCache } from './config.js';
import { collectVersions, type RawProject } from '../versions.js';

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
/** MantisBT prefixes global categories with "[All Projects] "; stripped so the names work in create_issue. */
export function stripAllProjectsPrefix(categories: MantisCategory[]): MantisCategory[] {
  return categories.map(cat => ({
    ...cat,
    name: cat.name.startsWith(ALL_PROJECTS_PREFIX) ? cat.name.slice(ALL_PROJECTS_PREFIX.length) : cat.name,
  }));
}

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
  const projectResult = await client.get<{ projects: Array<MantisProject & RawProject> }>('projects');
  const rawProjects = projectResult.projects ?? [];
  const projects = rawProjects.map(normalizeProject);

  const byProject: Record<number, CachedProjectMeta> = {};

  // GET /projects embeds every version of a project, obsolete ones included;
  // /versions ignores obsolete and inherit (#8614) and is only asked when a
  // project arrives without embedded versions.
  const embedsVersions = new Set(rawProjects.filter(p => p.versions !== undefined).map(p => p.id));

  // For each project, fetch users, versions, categories in parallel
  await Promise.all(
    projects.map(async (project) => {
      const [usersResult, versionsResult, projectDetailResult] = await Promise.allSettled([
        client.get<{ users: MantisUser[] }>(`projects/${project.id}/users`),
        embedsVersions.has(project.id)
          ? { versions: [] as MantisVersion[] }
          : client.get<{ versions: MantisVersion[] }>(`projects/${project.id}/versions`, { obsolete: 1, inherit: 1 }),
        // Categories are embedded in the project detail response — same source as get_project_categories
        client.get<{ projects: Array<{ categories?: MantisCategory[] }> }>(`projects/${project.id}`),
      ]);

      const users: MantisUser[] = usersResult.status === 'fulfilled'
        ? (usersResult.value.users ?? [])
        : [];

      const versions = collectVersions({
        own: versionsResult.status === 'fulfilled' ? (versionsResult.value.versions ?? []) : [],
        projects: rawProjects,
        projectId: project.id,
        obsolete: true,
        inherit: true,
      });

      const rawCategories: MantisCategory[] = projectDetailResult.status === 'fulfilled'
        ? (projectDetailResult.value.projects?.[0]?.categories ?? [])
        : [];
      const categories = stripAllProjectsPrefix(rawCategories);

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

export function registerMetadataTools(
  server: McpServer,
  client: MantisClient,
  cache: MetadataCache,
  searchIndexStatus?: () => Promise<SearchIndexStatus>,
): void {

  /** Metadata from the cache, synced when missing, expired or when refresh is set. */
  async function loadMetadata(refresh: boolean): Promise<CachedMetadata> {
    const cached = refresh ? null : await cache.loadIfValid();
    return cached ?? fetchAndCacheMetadata(client, cache);
  }

  /**
   * Valid "select" field names: from the cache, else discovered from a sample
   * issue plus the fields MantisBT strips when empty, else a static list.
   */
  async function loadIssueFields(projectId?: number): Promise<{ fields: string[]; source: 'cache' | 'live' | 'static' }> {
    const cached = await cache.loadIssueFields();
    if (cached) return { fields: cached, source: 'cache' };

    const result = await client.get<MantisPaginatedIssues>('issues', { page: 1, page_size: 1, project_id: projectId });
    const sample = result.issues?.[0];
    const fields = sample
      ? Array.from(new Set([...Object.keys(sample), ...EMPTY_STRIPPED_FIELDS])).sort()
      : STATIC_ISSUE_FIELDS;
    await cache.saveIssueFields(fields);
    return { fields, source: sample ? 'live' : 'static' };
  }

  // ---------------------------------------------------------------------------
  // sync_metadata
  // ---------------------------------------------------------------------------

  server.registerTool(
    'sync_metadata',
    {
      title: 'Sync Metadata Cache',
      description: `${deprecationNote('sync_metadata', 'get_metadata with refresh: true')}

Fetch all projects and their associated users, versions, categories, and tags from MantisBT and store them in the local metadata cache.

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
      description: `Return the cached MantisBT metadata (projects with their users, versions and categories, plus all tags).

- detail: "summary" (default) — compact counts: project count, tag count, per-project counts of users, versions and categories, cached_at, ttl_seconds.
- detail: "full" — the complete raw cache with all lists (large; minified JSON).
- refresh: true — re-fetch everything from MantisBT before answering (otherwise the cache is used and only synced when missing or expired; default TTL 24 hours).

When semantic search is enabled, the response also contains "search_index": how many issues are indexed vs. the total, and the time of the last sync.

For lists of a single project use get_project with include; for tags use list_tags.`,
      inputSchema: z.object({
        detail: z.enum(['summary', 'full']).default('summary').describe('"summary" (default): counts only; "full": the complete raw cache'),
        refresh: z.preprocess(coerceBool, z.boolean().default(false)).describe('Re-fetch all metadata from MantisBT first (default: false)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ detail, refresh }) => {
      try {
        const [data, searchIndex] = await Promise.all([
          loadMetadata(refresh),
          searchIndexStatus?.(),
        ]);

        if (detail === 'full') {
          return { content: [{ type: 'text', text: JSON.stringify({ ...data, search_index: searchIndex }) }] };
        }

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
          search_index: searchIndex,
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
      description: `${deprecationNote('get_metadata_full', 'get_metadata with detail: "full"')}

Return the complete raw MantisBT metadata cache: all projects with full fields, and per-project lists of users, versions, categories, plus all tags.

If the cache does not exist or has expired (default TTL: 24 hours), it will automatically sync first.
Use get_metadata with refresh: true to force a refresh.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const data = await loadMetadata(false);
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
      description: `${deprecationNote('get_issue_fields', 'get_issue_schema')}

Return all field names that are valid for the "select" parameter of list_issues and get_issue.

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
        return {
          content: [{ type: 'text', text: JSON.stringify(await loadIssueFields(project_id), null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_issue_schema
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issue_schema',
    {
      title: 'Get Issue Schema',
      description: `Return what is valid for issues on this MantisBT server, in one response:

- fields: all field names valid for the "select" parameter of get_issue, list_issues and search_issues. Discovered from a sample issue (reflects the server's active configuration) plus fields MantisBT omits when empty (notes, attachments, relationships, …); cached with the metadata TTL. fields_source tells where they came from: "cache", "live" or "static".
- enums: ID, name and (if available) localized label for severity, status, priority, resolution and reproducibility. "name" or "id" is what create_issue / update_issue accept; "canonical_name" appears on localized installations.

Call it before building a "select" string or before setting enum fields.`,
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().optional().describe('Optional project ID to scope the sample issue used for field discovery'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id }) => {
      try {
        const [{ fields, source }, enums] = await Promise.all([
          loadIssueFields(project_id),
          fetchIssueEnumsWithCache(client),
        ]);
        return {
          content: [{ type: 'text', text: JSON.stringify({ fields, fields_source: source, enums }, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
