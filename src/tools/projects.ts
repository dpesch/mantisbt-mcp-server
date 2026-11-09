import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { coerceBool } from '../coerce.js';
import { MantisClient } from '../client.js';
import type { MantisProject, MantisUser, MantisVersion, MantisCategory } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { normalizeProject, stripAllProjectsPrefix } from './metadata.js';
import { MetadataCache } from '../cache.js';
import { deprecationNote } from '../deprecation.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

/** Case-insensitive substring match on login name, real name and email. */
const matchMembers = (users: MantisUser[], query: string): MantisUser[] => {
  const q = query.toLowerCase();
  return users.filter(u =>
    u.name.toLowerCase().includes(q) ||
    (u.real_name?.toLowerCase().includes(q) ?? false) ||
    (u.email?.toLowerCase().includes(q) ?? false)
  );
};

const PROJECT_INCLUDES = ['categories', 'users', 'versions'] as const;

export function registerProjectTools(server: McpServer, client: MantisClient, cache?: MetadataCache): void {

  async function fetchVersions(projectId: number, obsolete?: boolean, inherit?: boolean): Promise<MantisVersion[]> {
    const params: Record<string, number> = {};
    if (obsolete) params.obsolete = 1;
    if (inherit) params.inherit = 1;
    const result = await client.get<{ versions: MantisVersion[] }>(`projects/${projectId}/versions`, params);
    return result.versions ?? [];
  }

  /**
   * Project users. The metadata cache has no access-level filter, so it is
   * used only when access_level is not given; otherwise the API filters.
   */
  async function fetchUsers(projectId: number, accessLevel?: number): Promise<MantisUser[]> {
    if (accessLevel === undefined) {
      const cached = cache ? await cache.loadIfValid() : null;
      const cachedUsers = cached?.byProject[projectId]?.users;
      if (cachedUsers) return cachedUsers;
    }
    const params: Record<string, number> = {};
    if (accessLevel !== undefined) params.access_level = accessLevel;
    const result = await client.get<{ users: MantisUser[] }>(`projects/${projectId}/users`, params);
    return result.users ?? [];
  }

  // ---------------------------------------------------------------------------
  // get_project
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_project',
    {
      title: 'Get Project',
      description: `Get one MantisBT project: its master data (id, name, description, status, enabled, view_state, access_level, subprojects) and, on request, its categories, users and versions in the same call.

- include: any of "categories", "users", "versions" (default: none — master data only).
- categories: names come without the "[All Projects] " prefix, ready for create_issue / update_issue.
- users: id, name (login name), real_name, email, access_level. access_level returns only users at or above that level (10=viewer, 25=reporter, 40=updater, 55=developer, 70=manager, 90=administrator) and implies include "users".
- member_query: case-insensitive substring search in login name, real name and email; returns all matching users. Implies include "users".
- versions: id, name, released, obsolete, timestamp. obsolete=true adds obsolete versions, inherit=true adds versions of parent projects; either implies include "versions".

Users come from the local metadata cache when it is fresh and no access_level is given. Prerequisites: obtain project_id from list_projects.`,
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().describe('Numeric project ID — use list_projects to discover project IDs'),
        include: z.array(z.enum(PROJECT_INCLUDES)).optional().describe('Related data to add: "categories", "users", "versions"'),
        access_level: z.coerce.number().int().optional().describe('Only users at or above this access level; implies include "users"'),
        member_query: z.string().min(1).optional().describe('Case-insensitive substring to find users by login name, real name or email; implies include "users"'),
        obsolete: z.preprocess(coerceBool, z.boolean().optional()).describe('Also return obsolete versions; implies include "versions"'),
        inherit: z.preprocess(coerceBool, z.boolean().optional()).describe('Also return versions inherited from parent projects; implies include "versions"'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, include, access_level, member_query, obsolete, inherit }) => {
      const wants = new Set(include);
      if (member_query !== undefined || access_level !== undefined) wants.add('users');
      if (obsolete !== undefined || inherit !== undefined) wants.add('versions');
      try {
        // Categories come with the project itself; users and versions need their own requests.
        const [projectResult, users, versions] = await Promise.all([
          client.get<{ projects: Array<MantisProject & { categories?: MantisCategory[] }> }>(`projects/${project_id}`),
          wants.has('users') ? fetchUsers(project_id, access_level) : undefined,
          wants.has('versions') ? fetchVersions(project_id, obsolete, inherit) : undefined,
        ]);
        const raw = projectResult.projects?.[0];
        if (!raw) throw new Error(`Project ${project_id} not found or not accessible.`);
        const project = {
          ...normalizeProject(raw),
          ...(wants.has('categories') && { categories: stripAllProjectsPrefix(raw.categories ?? []) }),
          ...(users && { users: member_query !== undefined ? matchMembers(users, member_query) : users }),
          ...(versions && { versions }),
        };
        return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

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
      description: `${deprecationNote('get_project_users', 'get_project with include: ["users"]')}

List all users with access to a specific MantisBT project. Returns an array of user objects, each containing id, name (login name), real_name, email, and access_level fields.

Access level IDs: 10=viewer, 25=reporter, 40=updater, 55=developer, 70=manager, 90=administrator.

Prerequisites: obtain project_id from list_projects.`,
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().describe('Numeric project ID — use list_projects to discover project IDs'),
        access_level: z.coerce.number().int().optional().describe('Return only users at or above this access level. Common values: 10=viewer, 25=reporter, 40=updater, 55=developer, 70=manager, 90=administrator. Omit to return all users.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, access_level }) => {
      try {
        const params: Record<string, number> = {};
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
      description: `${deprecationNote('get_project_versions', 'get_project with include: ["versions"]')}

List all versions defined for a MantisBT project. Returns an array of version objects, each containing id, name, released (boolean), obsolete (boolean), and timestamp (version date). To create, change, release or delete versions use create_version, update_version, release_version and delete_version.

Use the returned version names directly when creating or updating issues via create_issue and update_issue (version, target_version, fixed_in_version fields).

By default, obsolete and inherited parent-project versions are excluded. Set obsolete=true to include deprecated versions; set inherit=true to also return versions from parent projects.

Prerequisites: obtain project_id from list_projects.`,
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().describe('Numeric project ID — use list_projects to discover project IDs'),
        obsolete: z.preprocess(coerceBool, z.boolean().default(false)).describe('Include obsolete (deprecated) versions in the response. Default: false. Set to true to see all versions including those no longer actively used.'),
        inherit: z.preprocess(coerceBool, z.boolean().default(false)).describe('Include versions inherited from parent projects. Default: false. Set to true for sub-projects that share versions with a parent project.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, obsolete, inherit }) => {
      try {
        const versions = await fetchVersions(project_id, obsolete, inherit);
        return {
          content: [{ type: 'text', text: JSON.stringify(versions, null, 2) }],
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
      description: `${deprecationNote('get_project_categories', 'get_project with include: ["categories"]')}

List all categories available for a MantisBT project.

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
        const categories = stripAllProjectsPrefix(result.projects?.[0]?.categories ?? []);
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
      description: `${deprecationNote('find_project_member', 'get_project with member_query')}

Search for users with access to a MantisBT project by name, display name, or email.

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
        const all = await fetchUsers(project_id);
        const users = query ? matchMembers(all, query) : all;
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
