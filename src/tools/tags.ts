import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerTagTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // attach_tags
  // ---------------------------------------------------------------------------

  server.registerTool(
    'attach_tags',
    {
      title: 'Attach Tags to Issue',
      description: `Attach one or more tags to a MantisBT issue.

Each tag can be specified either by ID or by name. If a tag name is provided
that does not exist yet, MantisBT will create it automatically (requires
tag_create_threshold permission, default: REPORTER).

Requires tag_attach_threshold permission (default: REPORTER).`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
        tags: z.array(
          z.object({
            id: z.coerce.number().int().positive().optional().describe('Tag ID'),
            name: z.string().min(1).optional().describe('Tag name'),
          }).refine(t => t.id !== undefined || t.name !== undefined, {
            message: 'Each tag must have at least an id or a name',
          })
        ).min(1).describe('Tags to attach — each entry needs at least id or name'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ issue_id, tags }) => {
      try {
        await client.post<unknown>(`issues/${issue_id}/tags`, { tags });
        return {
          content: [{ type: 'text', text: `Tags successfully attached to issue #${issue_id}.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // detach_tag
  // ---------------------------------------------------------------------------

  server.registerTool(
    'detach_tag',
    {
      title: 'Detach Tag from Issue',
      description: `Remove a tag from a MantisBT issue.

Requires tag_detach_own_threshold (default: REPORTER) for own tags,
or tag_detach_threshold (default: DEVELOPER) for tags attached by others.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
        tag_id: z.coerce.number().int().positive().describe('Numeric tag ID to remove'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ issue_id, tag_id }) => {
      try {
        await client.delete<unknown>(`issues/${issue_id}/tags/${tag_id}`);
        return {
          content: [{ type: 'text', text: `Tag #${tag_id} successfully removed from issue #${issue_id}.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
