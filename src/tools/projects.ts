import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisProject, MantisUser, MantisVersion, MantisCategory } from '../types.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

const ALL_PROJECTS_PREFIX = '[All Projects] ';

export function registerProjectTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // list_projects
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description: 'List all MantisBT projects accessible to the current API user.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const result = await client.get<{ projects: MantisProject[] }>('projects');
        return {
          content: [{ type: 'text', text: JSON.stringify(result.projects ?? result, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_project_users
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_project_users',
    {
      title: 'Get Project Users',
      description: 'List all users with access to a specific MantisBT project.',
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().describe('Numeric project ID'),
        access_level: z.coerce.number().int().optional().describe('Minimum access level filter (e.g. 55 = developer, 90 = manager)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, access_level }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (access_level !== undefined) params.access_level = access_level;
        const result = await client.get<{ users: MantisUser[] }>(`projects/${project_id}/users`, params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result.users ?? result, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_project_versions
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_project_versions',
    {
      title: 'Get Project Versions',
      description: 'List all versions defined for a MantisBT project.',
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().describe('Numeric project ID'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id }) => {
      try {
        const result = await client.get<{ versions: MantisVersion[] }>(`projects/${project_id}/versions`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result.versions ?? result, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_project_categories
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_project_categories',
    {
      title: 'Get Project Categories',
      description: `List all categories available for a MantisBT project.

Note: The MantisBT API returns global (cross-project) categories with a "[All Projects] " prefix.
This tool strips that prefix so the returned names can be used directly when creating issues.`,
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().describe('Numeric project ID'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id }) => {
      try {
        const result = await client.get<{ projects: Array<{ categories?: MantisCategory[] }> }>(`projects/${project_id}`);
        const raw = result.projects?.[0]?.categories ?? [];
        const categories = raw.map((cat) => ({
          ...cat,
          name: cat.name.startsWith(ALL_PROJECTS_PREFIX)
            ? cat.name.slice(ALL_PROJECTS_PREFIX.length)
            : cat.name,
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify(categories, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
