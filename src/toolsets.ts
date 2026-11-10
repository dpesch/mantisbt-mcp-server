import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// Tool groups for MANTIS_TOOLSETS and MANTIS_DISABLE_DESTRUCTIVE (#8500)
// ---------------------------------------------------------------------------

export const TOOLSETS = ['issues', 'notes', 'links', 'files', 'projects', 'versions', 'meta', 'search'] as const;
export type Toolset = typeof TOOLSETS[number];

/**
 * Group of every tool. A deprecated tool belongs to the group of its
 * replacement, so switching a group off hides old and new name together.
 * tests/toolsets.test.ts checks this list against the registered tools in
 * both directions — keep it in sync when adding or removing a tool.
 */
export const TOOL_GROUPS: Readonly<Record<string, Toolset>> = {
  // issues
  get_issue: 'issues',
  get_issues: 'issues',          // deprecated → get_issue
  list_issues: 'issues',
  create_issue: 'issues',
  update_issue: 'issues',
  delete_issue: 'issues',
  list_notes: 'issues',          // deprecated → get_issue
  list_issue_files: 'issues',    // deprecated → get_issue
  add_monitor: 'issues',         // deprecated → update_issue
  remove_monitor: 'issues',      // deprecated → update_issue
  // notes
  add_note: 'notes',
  delete_note: 'notes',
  // links
  add_relationship: 'links',
  remove_relationship: 'links',
  attach_tags: 'links',
  detach_tag: 'links',
  list_tags: 'links',
  // files
  upload_file: 'files',
  // projects
  list_projects: 'projects',
  get_project: 'projects',
  list_filters: 'projects',
  get_project_categories: 'projects', // deprecated → get_project
  get_project_users: 'projects',      // deprecated → get_project
  get_project_versions: 'projects',   // deprecated → get_project
  find_project_member: 'projects',    // deprecated → get_project
  // versions
  create_version: 'versions',
  update_version: 'versions',
  delete_version: 'versions',
  release_version: 'versions',   // deprecated → update_version
  // meta
  get_metadata: 'meta',
  get_metadata_full: 'meta',     // deprecated → get_metadata
  sync_metadata: 'meta',         // deprecated → get_metadata
  get_search_index_status: 'meta', // deprecated → get_metadata
  get_issue_schema: 'meta',
  get_issue_fields: 'meta',      // deprecated → get_issue_schema
  get_issue_enums: 'meta',       // deprecated → get_issue_schema
  get_config: 'meta',
  get_version: 'meta',
  get_mcp_version: 'meta',       // deprecated → get_version
  get_mantis_version: 'meta',    // deprecated → get_version
  get_current_user: 'meta',
  list_languages: 'meta',        // deprecated → get_current_user
  // search (additionally requires MANTIS_SEARCH_ENABLED=true)
  search_issues: 'search',
  rebuild_search_index: 'search',
};

/**
 * Parses MANTIS_TOOLSETS: comma-separated group names, case-insensitive.
 * Unset or empty means all groups. An unknown name throws, listing the valid
 * ones, so a typo does not silently hide tools.
 */
export function parseToolsets(raw: string | undefined): Set<Toolset> {
  const names = (raw ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (names.length === 0) return new Set(TOOLSETS);
  const unknown = names.find(name => !isToolset(name));
  if (unknown !== undefined) {
    throw new Error(`Unknown MANTIS_TOOLSETS group "${unknown}". Valid groups: ${TOOLSETS.join(', ')}.`);
  }
  return new Set(names.filter(isToolset));
}

const isToolset = (name: string): name is Toolset => (TOOLSETS as readonly string[]).includes(name);

export interface ToolFilter {
  toolsets: ReadonlySet<Toolset>;
  /** Hide every tool whose annotations say destructiveHint: true. */
  disableDestructive: boolean;
}

/**
 * Returns the server with registerTool filtered: tools of disabled groups and,
 * with disableDestructive, destructive tools are skipped. Everything else
 * (resources, prompts, connect, …) passes through unchanged. The register*Tools
 * functions receive this instead of the server and need no changes.
 */
export function filterToolRegistration(server: McpServer, filter: ToolFilter): McpServer {
  // registerTool is overloaded, so Parameters<> yields never; the filter only
  // reads annotations and passes config and callback through untouched.
  type RegisterTool = McpServer['registerTool'];
  const registerTool = ((name: string, config: { annotations?: { destructiveHint?: boolean } }, callback: unknown) => {
    const group = TOOL_GROUPS[name];
    if (group === undefined) {
      throw new Error(`Tool "${name}" has no group — add it to TOOL_GROUPS in src/toolsets.ts.`);
    }
    // A skipped tool is never registered, so it is neither listed nor callable.
    // No caller uses registerTool's return value.
    if (!filter.toolsets.has(group)) return undefined;
    if (filter.disableDestructive && config.annotations?.destructiveHint === true) return undefined;
    return server.registerTool(name, config as never, callback as never);
  }) as RegisterTool;

  return new Proxy(server, {
    get: (target, prop, receiver) => (prop === 'registerTool' ? registerTool : Reflect.get(target, prop, receiver)),
  });
}
