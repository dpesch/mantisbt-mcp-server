import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { RELATIONSHIP_TYPES } from '../constants.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerRelationshipTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // add_relationship
  // ---------------------------------------------------------------------------


  server.registerTool(
    'add_relationship',
    {
      title: 'Add Issue Relationship',
      description: `Add a relationship between two MantisBT issues.

Relationship type IDs:
- ${RELATIONSHIP_TYPES.DUPLICATE_OF} = duplicate_of    — this issue is a duplicate of target
- ${RELATIONSHIP_TYPES.RELATED_TO}   = related_to      — this issue is related to target
- ${RELATIONSHIP_TYPES.PARENT_OF}    = parent_of       — this issue depends on target (target must be done first)
- ${RELATIONSHIP_TYPES.CHILD_OF}     = child_of        — this issue blocks target (target can't proceed until this is done)
- ${RELATIONSHIP_TYPES.HAS_DUPLICATE} = has_duplicate  — this issue has target as a duplicate

Directionality note: "A child_of B" means A blocks B. "A parent_of B" means A depends on B.

Important: The API only accepts numeric type IDs, not string names.`,
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('The source issue ID (the one the relationship is added to)'),
        target_id: z.number().int().positive().describe('The target issue ID'),
        type_id: z.number().int().min(0).max(4).describe(
          `Relationship type ID: 0=duplicate_of, 1=related_to, 2=parent_of (depends on), 3=child_of (blocks), 4=has_duplicate`
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ issue_id, target_id, type_id }) => {
      try {
        const body = {
          issue: { id: target_id },
          type: { id: type_id },
        };
        const result = await client.post<unknown>(`issues/${issue_id}/relationships`, body);
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
  // remove_relationship
  // ---------------------------------------------------------------------------

  server.registerTool(
    'remove_relationship',
    {
      title: 'Remove Issue Relationship',
      description: `Remove a relationship from a MantisBT issue.

Use get_issue first to retrieve the relationship IDs. The relationship_id is the numeric id field of a relationship object in the issue's relationships array (not the type ID).`,
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('The issue ID the relationship belongs to'),
        relationship_id: z.number().int().positive().describe('The numeric ID of the relationship to remove (from the relationships array in get_issue)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ issue_id, relationship_id }) => {
      try {
        await client.delete<unknown>(`issues/${issue_id}/relationships/${relationship_id}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true }, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
