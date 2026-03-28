import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { MetadataCache } from '../cache.js';
import type { MantisIssue, MantisUser, MantisPaginatedIssues } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { MANTIS_CANONICAL_ENUM_NAMES, MANTIS_RESOLVED_STATUS_ID, resolveEnumId } from '../constants.js';
import { dateFilterSchema, matchesDateFilter, hasDateFilter, type DateFilter } from '../date-filter.js';
import { fetchIssueEnumsWithCache } from './config.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

const GET_ISSUES_CONCURRENCY = 5;

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
  return `Invalid ${group} "${value}". Valid canonical names: ${valid}. Call get_issue_enums to see localized labels.`;
}

export function registerIssueTools(server: McpServer, client: MantisClient, cache: MetadataCache): void {

  // ---------------------------------------------------------------------------
  // get_issue
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issue',
    {
      title: 'Get Issue',
      description: 'Retrieve a single MantisBT issue by its numeric ID. Returns all issue fields including notes, attachments, and relationships. Notes are always included — no separate list_notes call needed.',
      inputSchema: z.object({
        id: z.coerce.number().int().positive().describe('Numeric issue ID'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ id }) => {
      try {
        const result = await client.get<{ issues: MantisIssue[] }>(`issues/${id}`);
        const issue = result.issues?.[0] ?? result;
        return {
          content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }],
        };
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
    async ({ ids }) => {
      const results = await runWithConcurrency(
        ids,
        GET_ISSUES_CONCURRENCY,
        async (id): Promise<MantisIssue | null> => {
          try {
            const result = await client.get<{ issues: MantisIssue[] }>(`issues/${id}`);
            return result.issues?.[0] ?? (result as unknown as MantisIssue);
          } catch {
            return null;
          }
        },
      );
      const found = results.filter((r) => r !== null).length;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            { issues: results, requested: ids.length, found, failed: ids.length - found },
            null,
            2,
          ),
        }],
      };
    },
  );

  // ---------------------------------------------------------------------------
  // list_issues
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_issues',
    {
      title: 'List Issues',
      description: 'List MantisBT issues with optional filtering. Returns a paginated list of issues. Use the "select" parameter to limit returned fields and reduce response size significantly.\n\nNote: "assigned_to", "reporter_id", "status", and date filters are applied client-side (the MantisBT REST API does not support these as server-side filters). When any of these filters are active the tool automatically fetches multiple pages internally until enough matching results are found (up to 500 issues scanned). The "page" and "page_size" parameters refer to the resulting filtered list.\n\nTip for date queries: fetching with select="id,updated_at,created_at" plus a date filter is very compact and efficient.',
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
        ...dateFilterSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, page, page_size, assigned_to, reporter_id, filter_id, sort, direction, select, status, updated_after, updated_before, created_after, created_before }) => {
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
        const needsClientFilter = status !== undefined || assigned_to !== undefined || reporter_id !== undefined || hasDateFilter(dateFilter);

        if (!needsClientFilter) {
          // No client-side filtering — single API call, pass pagination as-is
          const result = await client.get<MantisPaginatedIssues>('issues', { ...baseParams, page, page_size });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Client-side filtering active: scan multiple API pages until we have
        // enough matching results for the requested logical page.
        const API_PAGE_SIZE = 50; // always fetch max to minimise round-trips
        const MAX_API_PAGES = 10; // hard cap: scan at most 500 issues
        const neededTotal = page * page_size; // need this many matches to serve page N

        const matching: MantisIssue[] = [];
        let serverPage = 1;
        let hasMore = true;

        const statusLower = status?.toLowerCase();
        // Pre-parse date thresholds once — avoids repeated new Date() inside the scan loop
        const updatedAfterMs = updated_after ? new Date(updated_after).getTime() : undefined;

        while (matching.length < neededTotal && serverPage <= MAX_API_PAGES && hasMore) {
          const batch = await client.get<MantisPaginatedIssues>('issues', {
            ...baseParams,
            page: serverPage,
            page_size: API_PAGE_SIZE,
          });

          const issues = batch.issues ?? [];
          hasMore = issues.length === API_PAGE_SIZE;

          let stopAfterBatch = false;
          for (const issue of issues) {
            if (statusLower) {
              if (!issue.status) continue;
              if (statusLower === 'open') {
                if ((issue.status.id ?? 0) >= MANTIS_RESOLVED_STATUS_ID) continue;
              } else if (issue.status.name?.toLowerCase() !== statusLower) {
                continue;
              }
            }
            if (assigned_to !== undefined && issue.handler?.id !== assigned_to) continue;
            if (reporter_id !== undefined && issue.reporter?.id !== reporter_id) continue;
            if (!matchesDateFilter(issue, dateFilter)) {
              // MantisBT returns results newest-first. Once updated_at drops below
              // updated_after, all subsequent pages are guaranteed to be older too.
              // Finish the current batch first (items within it may still be newer),
              // then stop fetching further pages.
              if (updatedAfterMs && issue.updated_at && new Date(issue.updated_at).getTime() <= updatedAfterMs) {
                stopAfterBatch = true;
              }
              continue;
            }
            matching.push(issue);
          }

          if (stopAfterBatch) break;
          serverPage++;
        }

        const start = (page - 1) * page_size;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ issues: matching.slice(start, start + page_size) }, null, 2),
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
      description: 'Create a new MantisBT issue. Returns the created issue including its assigned ID.',
      inputSchema: z.object({
        summary: z.string().min(1).describe('Issue summary/title'),
        description: z.string().min(1).describe('Detailed issue description. Required — do not create issues without a description. Plain text or Markdown.'),
        project_id: z.coerce.number().int().positive().describe('Project ID the issue belongs to'),
        category: z.string().min(1).describe('Category name (use get_project_categories to list available categories)'),
        priority: z.string().default('normal').describe('Priority: canonical English name (none, low, normal, high, urgent, immediate) or localized label. Default: "normal". Use get_issue_enums to see all available values.'),
        severity: z.string().default('minor').describe('Severity: canonical English name (feature, trivial, text, tweak, minor, major, crash, block) or localized label. Default: "minor". Use get_issue_enums to see all available values.'),
        handler_id: z.coerce.number().int().positive().optional().describe('User ID of the person to assign the issue to'),
        handler: z.string().optional().describe('Username (login name) of the person to assign the issue to. Alternative to handler_id — the server resolves the name to a user ID from the project members. Use get_project_users to see available users.'),
        version: z.string().optional().describe('Affected product version name (use get_project_versions to list available versions)'),
        target_version: z.string().optional().describe('Target version name — version in which the issue is planned to be fixed (use get_project_versions to list available versions)'),
        fixed_in_version: z.string().optional().describe('Version name in which the issue was fixed (use get_project_versions to list available versions)'),
        steps_to_reproduce: z.string().optional().describe('Steps to reproduce the issue. Plain text or Markdown.'),
        additional_information: z.string().optional().describe('Additional information about the issue. Plain text or Markdown.'),
        reproducibility: z.string().optional().describe('Reproducibility: canonical English name or localized label (always, sometimes, random, have not tried, unable to reproduce, N/A). Use get_issue_enums to see all available values.'),
        view_state: z.enum(['public', 'private']).optional().describe('Visibility of the issue: "public" (default) or "private"'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ summary, description, project_id, category, priority, severity, handler_id, handler, version, target_version, fixed_in_version, steps_to_reproduce, additional_information, reproducibility, view_state }) => {
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
            content: [{ type: 'text', text: errorText(`User "${handler}" not found in project ${project_id}. Available users: ${names || 'none (run sync_metadata or check project_id)'}`) }],
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

        const raw = await client.post<Record<string, unknown>>('issues', body);
        const partial = ('issue' in raw && typeof raw['issue'] === 'object' && raw['issue'] !== null)
          ? raw['issue'] as MantisIssue
          : raw as unknown as MantisIssue;
        let issue: MantisIssue = partial;
        if (!('summary' in (partial as unknown as Record<string, unknown>))) {
          // Older MantisBT returned only { id: N } — fetch the full issue.
          // Suppress GET errors: the issue was already created.
          try {
            const fetched = await client.get<{ issues: MantisIssue[] }>(`issues/${partial.id}`);
            issue = fetched.issues?.[0] ?? partial;
          } catch {
            // unable to fetch details — return minimal object
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }],
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

  // MantisBT reference shape: at least one of id or name must be provided
  const ref = z.object({ id: z.number().optional(), name: z.string().optional() })
    .refine(o => o.id !== undefined || o.name !== undefined, { message: "At least one of 'id' or 'name' must be provided" });

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

Important: when resolving an issue, always set BOTH status and resolution to avoid leaving resolution as "open".`,
      inputSchema: z.object({
        id: z.coerce.number().int().positive().describe('Numeric issue ID to update'),
        dry_run: z.boolean().optional().describe('If true, return the patch payload that would be sent without actually updating the issue. Useful for previewing changes before committing them.'),
        fields: z.object({
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
        }).strict().describe('Fields to update (partial update — only provided fields are changed; unknown keys are rejected)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ id, fields, dry_run }) => {
      if (dry_run) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ dry_run: true, id, would_patch: fields }, null, 2) }],
        };
      }
      try {
        const result = await client.patch<{ issue: MantisIssue }>(`issues/${id}`, fields);
        return {
          content: [{ type: 'text', text: JSON.stringify(result.issue ?? result, null, 2) }],
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
