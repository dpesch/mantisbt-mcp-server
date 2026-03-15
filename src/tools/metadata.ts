import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { MetadataCache, type CachedMetadata, type CachedProjectMeta } from '../cache.js';
import type { MantisProject, MantisUser, MantisVersion, MantisCategory } from '../types.js';
import { getVersionHint } from '../version-hint.js';

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
}
