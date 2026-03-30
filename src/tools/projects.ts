import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisProject, MantisUser, MantisVersion, MantisCategory } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { ALL_PROJECTS_PREFIX } from '../constants.js';
import { normalizeProject } from './metadata.js';
import { MetadataCache } from '../cache.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

const coerceBool = (val: unknown) =>
  val === 'true' ? true : val === 'false' ? false : val;

export function registerProjectTools(server: McpServer, client: MantisClient, cache?: MetadataCache): void {

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
        const projects = (result.projects ?? []).map(normalizeProject);
        return {
          content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
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
        obsolete: z.preprocess(coerceBool, z.boolean()).default(false).describe('Include obsolete (deprecated) versions (default: false)'),
        inherit: z.preprocess(coerceBool, z.boolean()).default(false).describe('Include versions inherited from parent projects (default: false)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, obsolete, inherit }) => {
      try {
        const params: Record<string, number> = {};
        if (obsolete) params.obsolete = 1;
        if (inherit) params.inherit = 1;
        const result = await client.get<{ versions: MantisVersion[] }>(`projects/${project_id}/versions`, params);
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

  // ---------------------------------------------------------------------------
  // find_project_member
  // ---------------------------------------------------------------------------

  server.registerTool(
    'find_project_member',
    {
      title: 'Find Project Member',
      description: `Search for users with access to a MantisBT project by name, display name, or email.

Returns up to \`limit\` matching users (default: 10, max: 100). Matching is case-insensitive substring search across \`name\`, \`real_name\`, and \`email\` fields. Omit \`query\` to list the first \`limit\` users.

Data is served from the local metadata cache when fresh; falls back to a live API call otherwise.`,
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().describe('Numeric project ID'),
        query: z.string().optional().describe('Case-insensitive substring to match against name, real_name, or email'),
        limit: z.coerce.number().int().min(1).max(100).default(10).describe('Maximum number of results to return (default: 10, max: 100)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, query, limit }) => {
      try {
        let users: MantisUser[];
        const cached = cache ? await cache.loadIfValid() : null;
        if (cached?.byProject[project_id]) {
          users = cached.byProject[project_id]!.users;
        } else {
          const result = await client.get<{ users: MantisUser[] }>(`projects/${project_id}/users`);
          users = result.users ?? [];
        }
        if (query) {
          const q = query.toLowerCase();
          users = users.filter((u) =>
            u.name.toLowerCase().includes(q) ||
            (u.real_name?.toLowerCase().includes(q) ?? false) ||
            (u.email?.toLowerCase().includes(q) ?? false)
          );
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(users.slice(0, limit), null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
