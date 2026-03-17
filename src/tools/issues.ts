import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { MetadataCache } from '../cache.js';
import type { MantisIssue, MantisUser, MantisPaginatedIssues } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { MANTIS_RESOLVED_STATUS_ID } from '../constants.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerIssueTools(server: McpServer, client: MantisClient, cache: MetadataCache): void {

  // ---------------------------------------------------------------------------
  // get_issue
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issue',
    {
      title: 'Get Issue',
      description: 'Retrieve a single MantisBT issue by its numeric ID. Returns all issue fields including notes, attachments, and relationships.',
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
  // list_issues
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_issues',
    {
      title: 'List Issues',
      description: 'List MantisBT issues with optional filtering. Returns a paginated list of issues. Use the "select" parameter to limit returned fields and reduce response size significantly.\n\nNote: "assigned_to", "reporter_id", and "status" filters are applied client-side (the MantisBT REST API does not reliably support these as server-side filters). When any of these filters are active the tool automatically fetches multiple pages internally until enough matching results are found (up to 500 issues scanned). The "page" and "page_size" parameters refer to the resulting filtered list.',
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
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, page, page_size, assigned_to, reporter_id, filter_id, sort, direction, select, status }) => {
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

        const needsClientFilter = status !== undefined || assigned_to !== undefined || reporter_id !== undefined;

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

        while (matching.length < neededTotal && serverPage <= MAX_API_PAGES && hasMore) {
          const batch = await client.get<MantisPaginatedIssues>('issues', {
            ...baseParams,
            page: serverPage,
            page_size: API_PAGE_SIZE,
          });

          const issues = batch.issues ?? [];
          hasMore = issues.length === API_PAGE_SIZE;

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
            matching.push(issue);
          }

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
        description: z.string().default('').describe('Detailed issue description'),
        project_id: z.coerce.number().int().positive().describe('Project ID the issue belongs to'),
        category: z.string().min(1).describe('Category name (use get_project_categories to list available categories)'),
        priority: z.string().optional().describe('Priority name (e.g. "normal", "high", "urgent", "immediate", "low", "none")'),
        severity: z.string().default('minor').describe('Severity name (e.g. "minor", "major", "crash", "block", "feature", "trivial", "text") — default: "minor"'),
        handler_id: z.coerce.number().int().positive().optional().describe('User ID of the person to assign the issue to'),
        handler: z.string().optional().describe('Username (login name) of the person to assign the issue to. Alternative to handler_id — the server resolves the name to a user ID from the project members. Use get_project_users to see available users.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ summary, description, project_id, category, priority, severity, handler_id, handler }) => {
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
        if (priority) body.priority = { name: priority };
        body.severity = { name: severity };
        if (resolvedHandlerId) body.handler = { id: resolvedHandlerId };

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

  server.registerTool(
    'update_issue',
    {
      title: 'Update Issue',
      description: `Update one or more fields of an existing MantisBT issue using a partial PATCH.

The "fields" object accepts any combination of:
- summary (string)
- description (string)
- status: { name: "new"|"feedback"|"acknowledged"|"confirmed"|"assigned"|"resolved"|"closed" }
- resolution: { id: 20 }  (20 = fixed/resolved)
- handler: { id: <user_id> } or { name: "<username>" }
- priority: { name: "<priority_name>" }
- severity: { name: "<severity_name>" }
- category: { name: "<category_name>" }
- target_version: { name: "<version_name>" }
- fixed_in_version: { name: "<version_name>" }

Important: when resolving an issue, always set BOTH status and resolution to avoid leaving resolution as "open".`,
      inputSchema: z.object({
        id: z.coerce.number().int().positive().describe('Numeric issue ID to update'),
        fields: z.record(z.unknown()).describe('Object containing the fields to update (partial update — only provided fields are changed)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ id, fields }) => {
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
