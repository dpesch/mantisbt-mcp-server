import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisIssue, MantisPaginatedIssues } from '../types.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerIssueTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // get_issue
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issue',
    {
      title: 'Get Issue',
      description: 'Retrieve a single MantisBT issue by its numeric ID. Returns all issue fields including notes, attachments, and relationships.',
      inputSchema: z.object({
        id: z.number().int().positive().describe('Numeric issue ID'),
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
      description: 'List MantisBT issues with optional filtering. Returns a paginated list of issues. Use the "select" parameter to limit returned fields and reduce response size significantly.',
      inputSchema: z.object({
        project_id: z.number().int().positive().optional().describe('Filter by project ID'),
        page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
        page_size: z.number().int().min(1).max(50).default(50).describe('Issues per page (default: 50, max: 50)'),
        assigned_to: z.number().int().positive().optional().describe('Filter by handler/assignee user ID'),
        reporter_id: z.number().int().positive().optional().describe('Filter by reporter user ID'),
        filter_id: z.number().int().positive().optional().describe('Use a saved MantisBT filter ID'),
        sort: z.string().optional().describe('Sort field (e.g. "last_updated", "id")'),
        direction: z.enum(['ASC', 'DESC']).optional().describe('Sort direction'),
        select: z.string().optional().describe('Comma-separated list of fields to include in the response (server-side projection). Significantly reduces response size. Example: "id,summary,status,priority,handler,updated_at"'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, page, page_size, assigned_to, reporter_id, filter_id, sort, direction, select }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          page,
          page_size,
          project_id,
          assigned_to,
          reporter_id,
          filter_id,
          sort,
          direction,
          select,
        };
        const result = await client.get<MantisPaginatedIssues>('issues', params);
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
        project_id: z.number().int().positive().describe('Project ID the issue belongs to'),
        category: z.string().min(1).describe('Category name (use get_project_categories to list available categories)'),
        priority: z.string().optional().describe('Priority name (e.g. "normal", "high", "urgent", "immediate", "low", "none")'),
        severity: z.string().optional().describe('Severity name (e.g. "minor", "major", "crash", "block", "feature", "trivial", "text")'),
        handler_id: z.number().int().positive().optional().describe('User ID of the person to assign the issue to'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ summary, description, project_id, category, priority, severity, handler_id }) => {
      try {
        const body: Record<string, unknown> = {
          summary,
          description,
          project: { id: project_id },
          category: { name: category },
        };
        if (priority) body.priority = { name: priority };
        if (severity) body.severity = { name: severity };
        if (handler_id) body.handler = { id: handler_id };

        const result = await client.post<{ issue: MantisIssue }>('issues', body);
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
        id: z.number().int().positive().describe('Numeric issue ID to update'),
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
        id: z.number().int().positive().describe('Numeric issue ID to delete'),
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
