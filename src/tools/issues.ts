import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { coerceBool } from '../coerce.js';
import { MantisClient, buildIssueViewUrl } from '../client.js';
import { enrichIssue } from '../issue-enrich.js';
import { MetadataCache } from '../cache.js';
import type { MantisIdName, MantisIssue, MantisUser, MantisPaginatedIssues } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { MANTIS_CANONICAL_ENUM_NAMES, MANTIS_RESOLVED_STATUS_ID, resolveEnumId } from '../constants.js';
import { dateFilterSchema, matchesDateFilter, hasDateFilter, type DateFilter } from '../date-filter.js';
import { fetchIssueEnumsWithCache } from './config.js';
import { postNote, noteEditsSchema, prepareNoteEdits, verifyNoteEdits } from './notes.js';
import { applyMonitorChanges } from './monitors.js';
import { firstIssue, type IssueEnvelope } from '../issue-envelope.js';
import { deprecationNote, REMOVAL_VERSION } from '../deprecation.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}


// MantisBT reference shape: at least one of id or name must be provided
const ref = z.object({ id: z.number().optional(), name: z.string().optional() })
  .refine(o => o.id !== undefined || o.name !== undefined, { message: "At least one of 'id' or 'name' must be provided" });

// Custom field entry in MantisBT REST format: { field: {id|name}, value: "<string>" }
const customFieldEntry = z.object({
  field: ref.describe('Custom field reference: { id } or { name }'),
  value: z.coerce.string().describe('Field value as string'),
});

const GET_ISSUES_CONCURRENCY = 5;

const GROUP_BY_FIELDS = ['status', 'handler', 'priority', 'category'] as const;
type GroupByField = typeof GROUP_BY_FIELDS[number];

// group_by scans every matching issue. MantisBT 2.28 does not cap page_size
// and returns no total count; 1000 issues per page with a narrow select
// scanned 7,700 issues in about 1 s. The cap guards against huge instances.
const GROUP_BY_PAGE_SIZE = 1000;
const GROUP_BY_MAX_PAGES = 50;

interface IssueFilterOptions {
  status?: string;
  assigned_to?: number;
  reporter_id?: number;
  dateFilter: DateFilter;
}

/**
 * The client-side filters of list_issues (the MantisBT REST API does not apply
 * them server-side), shared by the paged listing and group_by.
 */
function makeIssueFilter({ status, assigned_to, reporter_id, dateFilter }: IssueFilterOptions) {
  const statusLower = status?.toLowerCase();
  const statusId = status ? resolveEnumId('status', status) : undefined;
  // Pre-parse once — avoids repeated new Date() inside the scan loop
  const updatedAfterMs = dateFilter.updated_after ? new Date(dateFilter.updated_after).getTime() : undefined;

  const matchesStatus = (issue: MantisIssue): boolean => {
    if (!statusLower) return true;
    if (!issue.status) return false;
    if (statusLower === 'open') return (issue.status.id ?? 0) < MANTIS_RESOLVED_STATUS_ID;
    if (statusId !== undefined) return issue.status.id === statusId;
    return issue.status.name?.toLowerCase() === statusLower;
  };

  /** Fields the filters read — needed in a narrow select. */
  const fields = [
    ...(status !== undefined ? ['status'] : []),
    ...(assigned_to !== undefined ? ['handler'] : []),
    ...(reporter_id !== undefined ? ['reporter'] : []),
    ...(dateFilter.updated_after || dateFilter.updated_before ? ['updated_at'] : []),
    ...(dateFilter.created_after || dateFilter.created_before ? ['created_at'] : []),
  ];

  return {
    /** True when any client-side filter is set (every filter reads a field). */
    active: fields.length > 0,
    fields,
    matches: (issue: MantisIssue): boolean =>
      matchesStatus(issue)
      && (assigned_to === undefined || issue.handler?.id === assigned_to)
      && (reporter_id === undefined || issue.reporter?.id === reporter_id)
      && matchesDateFilter(issue, dateFilter),
    /**
     * MantisBT returns issues newest-first: once one is at or before
     * updated_after, every following page is older too.
     */
    olderThanUpdatedAfter: (issue: MantisIssue): boolean =>
      updatedAfterMs !== undefined && issue.updated_at !== undefined && new Date(issue.updated_at).getTime() <= updatedAfterMs,
  };
}

type IssueFilter = ReturnType<typeof makeIssueFilter>;

// response: "short" for create_issue / update_issue (#8598) — the fields that
// confirm what happened, instead of the whole issue with notes and history.
const responseSchema = z.enum(['short', 'full']).default('full').describe(
  `"full" (default): the whole issue as MantisBT returns it, including description, notes and history. ` +
  `"short": only the fields that confirm the change — far fewer tokens. The default changes to "short" in ${REMOVAL_VERSION}.`,
);
const SHORT_CREATE_FIELDS = ['id', 'summary', 'project', 'category', 'status', 'handler', 'created_at', 'view_url'];
const SHORT_UPDATE_FIELDS = ['id', 'summary', 'status', 'resolution', 'updated_at', 'view_url'];

/** Returns only the given top-level fields of an object (those it has). */
function pickFields<T extends object>(obj: T, fields: readonly string[]): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => fields.includes(key))) as Partial<T>;
}

/**
 * Short update_issue result: the core fields plus every changed field. Custom
 * fields and notes are narrowed to the entries that were changed.
 */
function shortUpdatedIssue(
  issue: MantisIssue,
  changes: { custom_fields?: Array<{ field: { id?: number; name?: string } }>; notes?: Array<{ id: number }> },
): Partial<MantisIssue> {
  const short = pickFields(issue, [...SHORT_UPDATE_FIELDS, ...Object.keys(changes)]);
  const { custom_fields: changedCustomFields, notes: editedNotes } = changes;
  if (short.custom_fields && changedCustomFields) {
    short.custom_fields = short.custom_fields.filter(({ field }) =>
      changedCustomFields.some(c => c.field.id === field.id || c.field.name === field.name));
  }
  if (short.notes && editedNotes) {
    short.notes = short.notes.filter(n => editedNotes.some(e => e.id === n.id));
  }
  return short;
}

/** Returns the issue without the given top-level fields. */
function omitFields(issue: MantisIssue, fields: readonly string[]): MantisIssue {
  if (fields.length === 0) return issue;
  return Object.fromEntries(Object.entries(issue).filter(([key]) => !fields.includes(key))) as MantisIssue;
}

interface IssueGroup {
  id: number | null;
  name: string;
  label?: string;
  count: number;
}

// Worker-pool: runs `fn` over all `items` with at most `concurrency` in-flight at once.
// nextIndex is only incremented inside microtasks, so the ++ is safe without a lock.
async function runWithConcurrency<T>(
  items: number[],
  concurrency: number,
  fn: (item: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

// Resolves an enum name (canonical or localized) to { id } or returns an error string.
async function resolveEnum(
  group: keyof typeof MANTIS_CANONICAL_ENUM_NAMES,
  value: string,
  client: MantisClient,
): Promise<{ id: number } | string> {
  const id = resolveEnumId(group, value);
  if (id !== undefined) return { id };

  try {
    const enums = await fetchIssueEnumsWithCache(client);
    const entries = enums[group] ?? [];
    const lower = value.toLowerCase();
    const entry = entries.find(
      e => e.name.toLowerCase() === lower ||
           (e.label !== undefined && e.label.toLowerCase() === lower),
    );
    if (entry !== undefined) return { id: entry.id };
  } catch {
    // localized lookup unavailable — fall through to static error
  }

  const valid = Object.values(MANTIS_CANONICAL_ENUM_NAMES[group]).join(', ');
  return `Invalid ${group} "${value}". Valid canonical names: ${valid}. Call get_issue_schema to see localized labels.`;
}

export function registerIssueTools(server: McpServer, client: MantisClient, cache: MetadataCache): void {

  /**
   * Pages through GET /issues and hands every issue matching the client-side
   * filter to onMatch (return false to stop). Ends on a short page, or after
   * the current page once MantisBT's newest-first order shows the rest is
   * older than updated_after. Returns truncated when maxPages ended the scan
   * before either happened.
   *
   * select is the caller's projection. The filter reads its fields from each
   * issue, so a select that omits them would fail every issue (#8597): they
   * are fetched as well and removed again before onMatch sees the issue.
   */
  async function scanMatchingIssues(
    params: Record<string, string | number | boolean | undefined>,
    select: string | undefined,
    filter: IssueFilter,
    pageSize: number,
    maxPages: number,
    onMatch: (issue: MantisIssue) => boolean | void,
  ): Promise<{ truncated: boolean }> {
    const selected = select?.split(',').map(f => f.trim()).filter(Boolean);
    const extraFields = selected ? filter.fields.filter(f => !selected.includes(f)) : [];
    const fetchSelect = selected && [...selected, ...extraFields].join(',');

    for (let page = 1; page <= maxPages; page++) {
      const issues = (await client.get<MantisPaginatedIssues>('issues', { ...params, select: fetchSelect, page, page_size: pageSize })).issues ?? [];
      let stopAfterBatch = false;
      for (const issue of issues) {
        if (filter.matches(issue)) {
          if (onMatch(omitFields(issue, extraFields)) === false) return { truncated: false };
        } else if (filter.olderThanUpdatedAfter(issue)) {
          stopAfterBatch = true; // finish the batch — items within it may still be newer
        }
      }
      if (issues.length < pageSize || stopAfterBatch) return { truncated: false };
    }
    return { truncated: true };
  }

  /**
   * Counts all matching issues per group (list_issues group_by), fetching only
   * the fields grouping and filters need.
   */
  async function groupIssues(
    groupBy: GroupByField,
    params: Record<string, string | number | undefined>,
    filter: IssueFilter,
  ): Promise<{ group_by: GroupByField; total: number; truncated?: true; groups: IssueGroup[] }> {
    const groups = new Map<number | null, IssueGroup>();
    let total = 0;

    const { truncated } = await scanMatchingIssues(params, `id,${groupBy}`, filter, GROUP_BY_PAGE_SIZE, GROUP_BY_MAX_PAGES, issue => {
      const ref: Partial<MantisIdName> | undefined = issue[groupBy];
      const key = ref?.id ?? null;
      let group = groups.get(key);
      if (!group) {
        group = {
          id: key,
          name: ref?.name ?? (groupBy === 'handler' ? '(unassigned)' : '(none)'),
          ...(ref?.label !== undefined && { label: ref.label }),
          count: 0,
        };
        groups.set(key, group);
      }
      group.count++;
      total++;
    });

    const sorted = [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { group_by: groupBy, total, ...(truncated && { truncated: true as const }), groups: sorted };
  }

  /**
   * Fetches and enriches one issue. The requested ID is passed to enrichIssue
   * so view_url survives a select without "id".
   */
  async function fetchIssue(id: number, select?: string): Promise<MantisIssue> {
    const [result, baseUrl] = await Promise.all([
      client.get<IssueEnvelope>(`issues/${id}`, { select }),
      client.getBaseUrl(),
    ]);
    return enrichIssue(firstIssue(result) ?? (result as MantisIssue), baseUrl, id);
  }

  /**
   * Fetches several issues in parallel (max GET_ISSUES_CONCURRENCY). Missing or
   * inaccessible IDs yield null at their position; the call itself never fails.
   */
  async function fetchIssuesByIds(ids: number[], select?: string) {
    const issues = await runWithConcurrency(ids, GET_ISSUES_CONCURRENCY, id =>
      fetchIssue(id, select).catch(() => null));
    const found = issues.filter(i => i !== null).length;
    return { issues, requested: ids.length, found, failed: ids.length - found };
  }

  // ---------------------------------------------------------------------------
  // get_issue
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issue',
    {
      title: 'Get Issue',
      description: `Retrieve one MantisBT issue by "id", or several by "ids" (1–50). Pass exactly one of the two.

With "id": returns the issue with all fields including notes (each with view_url), attachments and relationships, unless "select" is given.
With "ids": returns { issues, requested, found, failed } — requests run in parallel (max 5 concurrent); missing or inaccessible IDs give null at their position instead of failing the call.

Use "select" to fetch only some fields, e.g. select: "notes" for just the notes or select: "attachments" for just the file attachments of an issue.`,
      inputSchema: z.object({
        id: z.coerce.number().int().positive().optional().describe('Numeric issue ID (use either id or ids)'),
        ids: z.array(z.coerce.number().int().positive()).min(1).max(50).optional().describe('Several issue IDs (1–50) to fetch in one call (use either id or ids)'),
        select: z.string().optional().describe('Comma-separated list of fields to include in the response (server-side projection, same as list_issues). Significantly reduces response size. Example: "id,summary,status,notes"'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ id, ids, select }) => {
      if ((id === undefined) === (ids === undefined)) {
        return { content: [{ type: 'text', text: errorText('Pass exactly one of "id" or "ids".') }], isError: true };
      }
      if (ids) {
        return { content: [{ type: 'text', text: JSON.stringify(await fetchIssuesByIds(ids, select), null, 2) }] };
      }
      try {
        return { content: [{ type: 'text', text: JSON.stringify(await fetchIssue(id!, select), null, 2) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // get_issues
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issues',
    {
      title: 'Get Multiple Issues',
      description:
        `${deprecationNote('get_issues', 'get_issue with ids')}\n\n` +
        'Retrieve multiple MantisBT issues by their numeric IDs in a single MCP call. ' +
        'Requests run in parallel (max 5 concurrent). ' +
        'Missing or inaccessible IDs return null at their array position — ' +
        'the call never fails due to individual missing IDs. ' +
        'Response includes "requested", "found", and "failed" counters for quick validation.',
      inputSchema: z.object({
        ids: z
          .array(z.coerce.number().int().positive())
          .min(1)
          .max(50)
          .describe('Array of numeric issue IDs to fetch (1–50). null is returned per ID on 404/403/error instead of failing the whole call.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ ids }) => ({
      content: [{ type: 'text', text: JSON.stringify(await fetchIssuesByIds(ids), null, 2) }],
    }),
  );

  // ---------------------------------------------------------------------------
  // list_issues
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_issues',
    {
      title: 'List Issues',
      description: 'List MantisBT issues with optional filtering. Returns a paginated list of issues. Use the "select" parameter to limit returned fields and reduce response size significantly.\n\nNote: "assigned_to", "reporter_id", "status", and date filters are applied client-side (the MantisBT REST API does not support these as server-side filters). When any of these filters are active the tool automatically fetches multiple pages internally until enough matching results are found (up to 500 issues scanned); if that limit ends the search before the page is full, the response contains "truncated": true. The "page" and "page_size" parameters refer to the resulting filtered list.\n\nTip for date queries: fetching with select="id,updated_at,created_at" plus a date filter is very compact and efficient.\n\nFor overviews use "group_by" ("status", "handler", "priority" or "category"): the server counts all matching issues itself and returns { group_by, total, groups: [{ id, name, label?, count }] } instead of an issue list — far fewer tokens than listing issues and counting them. All filters still apply. If the scan stops at its limit (' + (GROUP_BY_PAGE_SIZE * GROUP_BY_MAX_PAGES).toLocaleString('en-US') + ' issues), the response contains "truncated": true.',
      inputSchema: z.object({
        project_id: z.coerce.number().int().positive().optional().describe('Filter by project ID'),
        page: z.coerce.number().int().positive().default(1).describe('Page number (default: 1)'),
        page_size: z.coerce.number().int().min(1).max(50).default(50).describe('Issues per page (default: 50, max: 50)'),
        assigned_to: z.coerce.number().int().positive().optional().describe('Filter by handler/assignee user ID'),
        reporter_id: z.coerce.number().int().positive().optional().describe('Filter by reporter user ID'),
        filter_id: z.coerce.number().int().positive().optional().describe('Use a saved MantisBT filter ID'),
        sort: z.string().optional().describe('Sort field (e.g. "last_updated", "id")'),
        direction: z.enum(['ASC', 'DESC']).optional().describe('Sort direction'),
        select: z.string().optional().describe('Comma-separated list of fields to include in the response (server-side projection). Significantly reduces response size. Example: "id,summary,status,priority,handler,updated_at"'),
        status: z.string().optional().describe('Filter issues by status name (e.g. "new", "feedback", "acknowledged", "confirmed", "assigned", "resolved", "closed") or use "open" as shorthand for all statuses with id < 80 (i.e. not yet resolved or closed). Applied client-side after fetching — when combined with pagination, a page may contain fewer results than page_size.'),
        group_by: z.enum(GROUP_BY_FIELDS).optional().describe('Return counts per group instead of issues: "status", "handler", "priority" or "category". All matching issues are counted (page, page_size and select are ignored).'),
        ...dateFilterSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, page, page_size, assigned_to, reporter_id, filter_id, sort, direction, select, status, group_by, updated_after, updated_before, created_after, created_before }) => {
      try {
        const baseParams: Record<string, string | number | boolean | undefined> = {
          project_id,
          assigned_to,
          reporter_id,
          filter_id,
          sort,
          direction,
          select,
        };

        const dateFilter: DateFilter = { updated_after, updated_before, created_after, created_before };
        const filter = makeIssueFilter({ status, assigned_to, reporter_id, dateFilter });

        if (group_by) {
          const grouped = await groupIssues(group_by, { project_id, assigned_to, reporter_id, filter_id }, filter);
          return { content: [{ type: 'text', text: JSON.stringify(grouped, null, 2) }] };
        }

        const baseUrl = await client.getBaseUrl();

        if (!filter.active) {
          // No client-side filtering — single API call, pass pagination as-is
          const result = await client.get<MantisPaginatedIssues>('issues', { ...baseParams, page, page_size });
          const enriched = { ...result, issues: result.issues?.map(i => enrichIssue(i, baseUrl)) };
          return {
            content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
          };
        }

        // Client-side filtering active: scan multiple API pages until we have
        // enough matching results for the requested logical page.
        const API_PAGE_SIZE = 50; // always fetch max to minimise round-trips
        const MAX_API_PAGES = 10; // hard cap: scan at most 500 issues
        const neededTotal = page * page_size; // need this many matches to serve page N

        const matching: MantisIssue[] = [];
        const { truncated } = await scanMatchingIssues(baseParams, select, filter, API_PAGE_SIZE, MAX_API_PAGES, issue => {
          matching.push(issue);
          return matching.length < neededTotal;
        });

        const start = (page - 1) * page_size;
        const pageIssues = matching.slice(start, start + page_size).map(i => enrichIssue(i, baseUrl));
        // truncated: the scan limit ended the search before enough matches were found.
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ issues: pageIssues, ...(truncated && { truncated: true }) }, null, 2),
          }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // create_issue
  // ---------------------------------------------------------------------------

  server.registerTool(
    'create_issue',
    {
      title: 'Create Issue',
      description: `Create a new MantisBT issue. Returns the full created issue object including the assigned id, summary, status, priority, severity, category, reporter, created_at, and view_url. With response: "short" only id, summary, project, category, status, handler, created_at and view_url (default "full"; it changes to "short" in ${REMOVAL_VERSION}).

Required fields: summary, description, project_id, category. All other fields are optional with sensible defaults (priority: "normal", severity: "minor").

Recommended workflow:
1. Call get_project with include: ["categories"] to obtain a valid category name
2. Optionally add "versions" to include to obtain version names
3. Optionally call get_project with member_query to resolve the assignee's username

Both priority and severity accept canonical English names or localized labels from the connected MantisBT instance — call get_issue_schema to see all available values.

For the handler, prefer the username field (resolved server-side) over handler_id when working interactively.`,
      inputSchema: z.object({
        summary: z.string().min(1).describe('Issue summary/title (required)'),
        description: z.string().min(1).describe('Detailed issue description (required). Do not create issues without a description. Plain text or Markdown.'),
        project_id: z.coerce.number().int().positive().describe('Project ID the issue belongs to — use list_projects to discover project IDs'),
        category: z.string().min(1).describe('Category name (required). Use get_project with include: ["categories"] to list available categories for the project.'),
        priority: z.string().default('normal').describe('Priority level. Canonical English names: none, low, normal, high, urgent, immediate. Default: "normal". Use get_issue_schema to see localized labels.'),
        severity: z.string().default('minor').describe('Severity level. Canonical English names: feature, trivial, text, tweak, minor, major, crash, block. Default: "minor". Use get_issue_schema to see localized labels.'),
        handler_id: z.coerce.number().int().positive().optional().describe('Numeric user ID of the assignee. Alternative to the handler field — use one or the other, not both.'),
        handler: z.string().optional().describe('MantisBT login name of the assignee. The server resolves the name to a user ID from the project member list. Use get_project with member_query or include: ["users"] to look up valid login names.'),
        version: z.string().optional().describe('Affected product version name. Use get_project with include: ["versions"] to list available version names for the project.'),
        target_version: z.string().optional().describe('Target fix version — version in which the issue is planned to be resolved. Use get_project with include: ["versions"] to list available version names.'),
        fixed_in_version: z.string().optional().describe('Version in which the issue was fixed. Use get_project with include: ["versions"] to list available version names.'),
        steps_to_reproduce: z.string().optional().describe('Step-by-step instructions to reproduce the issue. Plain text or Markdown.'),
        additional_information: z.string().optional().describe('Additional context or notes about the issue. Plain text or Markdown.'),
        reproducibility: z.string().optional().describe('How reliably the issue reproduces. Canonical English names: always, sometimes, random, have not tried, unable to reproduce, N/A. Use get_issue_schema to see localized labels.'),
        view_state: z.enum(['public', 'private']).optional().describe('Visibility of the issue: "public" (visible to all, default) or "private" (restricted to higher-access users).'),
        custom_fields: z.array(customFieldEntry).optional().describe('Custom field values: [{field: {id|name}, value: "<string>"}]. Use get_issue_schema or get_metadata to discover available custom fields per project.'),
        response: responseSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ summary, description, project_id, category, priority, severity, handler_id, handler, version, target_version, fixed_in_version, steps_to_reproduce, additional_information, reproducibility, view_state, custom_fields, response }) => {
      // Resolve handler username to handler_id when only a name is given
      let resolvedHandlerId = handler_id;
      if (resolvedHandlerId === undefined && handler !== undefined) {
        const metadata = await cache.loadIfValid();
        let users: MantisUser[] = metadata?.byProject[project_id]?.users ?? [];
        if (users.length === 0) {
          try {
            const usersResult = await client.get<{ users: MantisUser[] }>(`projects/${project_id}/users`);
            users = usersResult.users ?? [];
          } catch {
            users = [];
          }
        }
        const user = users.find(u => u.name === handler || u.real_name === handler);
        if (!user) {
          const names = users.map(u => u.name).join(', ');
          return {
            content: [{ type: 'text', text: errorText(`User "${handler}" not found in project ${project_id}. Available users: ${names || 'none (run get_metadata with refresh: true or check project_id)'}`) }],
            isError: true,
          };
        }
        resolvedHandlerId = user.id;
      }

      try {
        const body: Record<string, unknown> = {
          summary,
          description,
          project: { id: project_id },
          category: { name: category },
        };
        const priorityResolved = await resolveEnum('priority', priority, client);
        if (typeof priorityResolved === 'string') return { content: [{ type: 'text', text: errorText(priorityResolved) }], isError: true };
        body.priority = priorityResolved;
        const severityResolved = await resolveEnum('severity', severity, client);
        if (typeof severityResolved === 'string') return { content: [{ type: 'text', text: errorText(severityResolved) }], isError: true };
        body.severity = severityResolved;
        if (resolvedHandlerId) body.handler = { id: resolvedHandlerId };
        if (version !== undefined) body.version = { name: version };
        if (target_version !== undefined) body.target_version = { name: target_version };
        if (fixed_in_version !== undefined) body.fixed_in_version = { name: fixed_in_version };
        if (steps_to_reproduce !== undefined) body.steps_to_reproduce = steps_to_reproduce;
        if (additional_information !== undefined) body.additional_information = additional_information;
        if (reproducibility !== undefined) {
          const reproducibilityResolved = await resolveEnum('reproducibility', reproducibility, client);
          if (typeof reproducibilityResolved === 'string') return { content: [{ type: 'text', text: errorText(reproducibilityResolved) }], isError: true };
          body.reproducibility = reproducibilityResolved;
        }
        if (view_state !== undefined) body.view_state = { name: view_state };
        if (custom_fields !== undefined) body.custom_fields = custom_fields;

        const raw = await client.post<IssueEnvelope>('issues', body);
        const partial = firstIssue(raw) ?? (raw as MantisIssue);
        let issue: MantisIssue = partial;
        if (!('summary' in (partial as unknown as Record<string, unknown>))) {
          // Older MantisBT returned only { id: N } — fetch the issue (only the
          // short fields when those are all that is returned).
          // Suppress GET errors: the issue was already created.
          try {
            const select = response === 'short' ? SHORT_CREATE_FIELDS.filter(f => f !== 'view_url').join(',') : undefined;
            const fetched = await client.get<IssueEnvelope>(`issues/${partial.id}`, { select });
            issue = firstIssue(fetched) ?? partial;
          } catch {
            // unable to fetch details — return minimal object
          }
        }
        const enriched = enrichIssue(issue, await client.getBaseUrl());
        const result = response === 'short' ? pickFields(enriched, SHORT_CREATE_FIELDS) : enriched;
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // update_issue
  // ---------------------------------------------------------------------------

  /** PATCHes the issue fields (enum names resolved to IDs) and returns the enriched issue. */
  async function patchIssueFields(id: number, fields: Record<string, unknown>): Promise<MantisIssue> {
    const patch: Record<string, unknown> = { ...fields };
    for (const field of ['status', 'priority', 'severity', 'resolution', 'reproducibility'] as const) {
      const val = fields[field] as { id?: number; name?: string } | undefined;
      if (val?.name !== undefined && val.id === undefined) {
        const resolved = await resolveEnum(field, val.name, client);
        if (typeof resolved !== 'string') patch[field] = resolved;
      }
    }
    const [result, baseUrl] = await Promise.all([
      client.patch<IssueEnvelope>(`issues/${id}`, patch),
      client.getBaseUrl(),
    ]);
    const issue = firstIssue(result) ?? (result as MantisIssue);
    return enrichIssue(issue, baseUrl, id);
  }

  server.registerTool(
    'update_issue',
    {
      title: 'Update Issue',
      description: `Update one or more fields of an existing MantisBT issue using a partial PATCH.

The "fields" object accepts any combination of:
- summary (string)
- description (string)
- steps_to_reproduce (string)
- additional_information (string)
- status: { name: "new"|"feedback"|"acknowledged"|"confirmed"|"assigned"|"resolved"|"closed" }
- resolution: { id: 20 }  (20 = fixed/resolved)
- handler: { id: <user_id> } or { name: "<username>" }
- priority: { name: "<priority_name>" }
- severity: { name: "<severity_name>" }
- reproducibility: { name: "<reproducibility_name>" }
- category: { name: "<category_name>" }
- version: { name: "<version_name>" }  (affected version)
- target_version: { name: "<version_name>" }
- fixed_in_version: { name: "<version_name>" }
- view_state: { name: "public"|"private" }
- custom_fields: [{field: {id|name}, value: "<string>"}]  (only the listed custom fields are changed, others stay untouched; use get_issue_schema to discover fields)
- notes: [{ id: <note_id>, text?: "<new text>", view_state?: "public"|"private" }]  (edits existing notes; note IDs come from get_issue. An omitted view_state keeps the note's current visibility. To add a new note use the "note" parameter or add_note.)

Important: when resolving an issue, always set BOTH status and resolution to avoid leaving resolution as "open".

Use the optional "note" parameter to append a note in the same call (e.g. the reason for a status change) — no separate add_note call needed. For a note without field changes use add_note.

Use "add_monitors" / "remove_monitors" (lists of MantisBT login names) to change who watches the issue — "fields" may be omitted then. The response contains "monitors" with added/removed/not_monitoring and the current monitor list. Adding or removing other users requires the monitor_add_others_bug_threshold / monitor_delete_others_bug_threshold access level.

The response is the updated issue. With response: "short" it holds only id, summary, status, resolution, updated_at, view_url and the fields that were changed (custom_fields and notes narrowed to the changed entries; an appended note as { id, view_url }) — use it for routine changes. Default is "full"; it changes to "short" in ${REMOVAL_VERSION}.

Steps run in order: fields, monitors, note. Once one step succeeded, a later failure is reported inline ("notes_error" when a note edit was not applied, "monitors_error", "note_error") instead of failing the call — do not retry the steps that went through. Only if every requested step failed is the call an error.`,
      inputSchema: z.object({
        id: z.coerce.number().int().positive().describe('Numeric issue ID to update'),
        add_monitors: z.array(z.string().min(1)).min(1).optional().describe('MantisBT login names to add as monitors (watchers) of the issue'),
        remove_monitors: z.array(z.string().min(1)).min(1).optional().describe('MantisBT login names to remove from the monitors of the issue; names that are not monitoring are ignored'),
        dry_run: z.preprocess(coerceBool, z.boolean().optional()).describe('If true, return the patch payload that would be sent without actually updating the issue. Useful for previewing changes before committing them.'),
        note: z.string().min(1).optional().describe('Optional note text appended after a successful update (e.g. reason for a status change). Replaces a separate add_note call.'),
        note_view_state: z.enum(['public', 'private']).default('public').describe('Visibility of the appended note: "public" (default) or "private". Only used when "note" is set.'),
        response: responseSchema,
        fields: z.preprocess(
          (v) => {
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch { return v; }
          },
          z.object({
            summary: z.string().optional(),
            description: z.string().optional(),
            steps_to_reproduce: z.string().optional(),
            additional_information: z.string().optional(),
            status: ref.optional(),
            resolution: ref.optional(),
            priority: ref.optional(),
            severity: ref.optional(),
            reproducibility: ref.optional(),
            handler: ref.optional(),
            category: ref.optional(),
            version: ref.optional(),
            target_version: ref.optional(),
            fixed_in_version: ref.optional(),
            view_state: ref.optional(),
            custom_fields: z.array(customFieldEntry).optional(),
            notes: noteEditsSchema.optional(),
          }).strict().optional().describe('Fields to update (partial update — only provided fields are changed; unknown keys are rejected). May be omitted when only add_monitors, remove_monitors or note are given.')
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ id, fields, dry_run, note, note_view_state, add_monitors, remove_monitors, response: responseMode }) => {
      const fieldChanges = fields ?? {};
      const hasFields = Object.keys(fieldChanges).length > 0;
      const hasMonitorChanges = add_monitors !== undefined || remove_monitors !== undefined;

      if (!hasFields && !hasMonitorChanges && note === undefined) {
        return {
          content: [{ type: 'text', text: errorText('Nothing to update — pass fields, add_monitors, remove_monitors or note.') }],
          isError: true,
        };
      }
      const removing = new Set(remove_monitors?.map(u => u.toLowerCase()));
      const conflicting = add_monitors?.filter(u => removing.has(u.toLowerCase())) ?? [];
      if (conflicting.length > 0) {
        return {
          content: [{ type: 'text', text: errorText(`${conflicting.join(', ')} appear(s) in both add_monitors and remove_monitors.`) }],
          isError: true,
        };
      }

      try {
        // Note edits need the current notes first (unknown IDs, missing view_state).
        const noteEdits = fieldChanges.notes && await prepareNoteEdits(client, id, fieldChanges.notes);
        const patchFields = noteEdits ? { ...fieldChanges, notes: noteEdits } : fieldChanges;

        if (dry_run) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                dry_run: true,
                id,
                would_patch: patchFields,
                ...(add_monitors && { would_add_monitors: add_monitors }),
                ...(remove_monitors && { would_remove_monitors: remove_monitors }),
                would_add_note: note ?? null,
              }, null, 2),
            }],
          };
        }

        const short = responseMode === 'short';
        const patched = hasFields ? await patchIssueFields(id, patchFields) : undefined;
        const response: Record<string, unknown> = patched
          ? (short ? shortUpdatedIssue(patched, fieldChanges) : { ...patched })
          : { id, view_url: buildIssueViewUrl(await client.getBaseUrl(), id) };

        // MantisBT skips note edits it does not apply without an error, so the
        // response is checked.
        const noteProblems = noteEdits && patched ? verifyNoteEdits(noteEdits, patched.notes) : [];

        // As soon as one step succeeded, later failures are reported inline —
        // otherwise the caller would retry changes that already went through.
        // Only if every requested step failed is the call an error. The field
        // step succeeded unless note edits failed and no other field was sent.
        let succeeded = hasFields
          && (noteProblems.length === 0 || Object.keys(fieldChanges).some(k => k !== 'notes'));
        const failures: string[] = [];
        const describeFailure = (what: string, detail: string): string => {
          const message = succeeded
            ? `Issue #${id} was updated successfully, but ${what} failed: ${detail}`
            : `${what.charAt(0).toUpperCase()}${what.slice(1)} failed: ${detail}`;
          failures.push(message);
          return message;
        };

        if (noteProblems.length > 0) {
          response['notes_error'] = describeFailure('editing notes', `${noteProblems.join('; ')}.`);
        }

        if (hasMonitorChanges) {
          // The PATCH response already holds the monitor list; MantisBT omits
          // the key when the issue has no monitors.
          const knownMonitors = patched ? patched.monitors ?? [] : undefined;
          const { changes, problems } = await applyMonitorChanges(client, id, add_monitors, remove_monitors, knownMonitors);
          if (changes) response['monitors'] = changes;
          if (problems.length > 0) {
            response['monitors_error'] = describeFailure('changing monitors', problems.join(' '));
          } else {
            succeeded = true;
          }
        }

        if (note !== undefined) {
          try {
            const posted = await postNote(client, id, note, note_view_state);
            response['note'] = short ? pickFields(posted, ['id', 'view_url']) : posted;
            succeeded = true;
          } catch (noteError) {
            const noteMsg = noteError instanceof Error ? noteError.message : String(noteError);
            response['note_error'] = describeFailure('adding the note', `${noteMsg}. Retry with add_note.`);
          }
        }

        if (!succeeded) {
          return { content: [{ type: 'text', text: errorText(failures.join(' ')) }], isError: true };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // delete_issue
  // ---------------------------------------------------------------------------

  server.registerTool(
    'delete_issue',
    {
      title: 'Delete Issue',
      description: 'Permanently delete a MantisBT issue. This action is irreversible.',
      inputSchema: z.object({
        id: z.coerce.number().int().positive().describe('Numeric issue ID to delete'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ id }) => {
      try {
        await client.delete<unknown>(`issues/${id}`);
        return {
          content: [{ type: 'text', text: `Issue #${id} deleted successfully.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
