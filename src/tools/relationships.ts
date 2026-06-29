import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { RELATIONSHIP_TYPES, RELATIONSHIP_NAME_TO_ID } from '../constants.js';
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

Relationship types — use either type_id (numeric) or type_name (string):
- ${RELATIONSHIP_TYPES.DUPLICATE_OF} / "duplicate_of"  — this issue is a duplicate of target
- ${RELATIONSHIP_TYPES.RELATED_TO}   / "related_to"    — this issue is related to target
- ${RELATIONSHIP_TYPES.PARENT_OF}    / "parent_of"     — this issue depends on target (target must be done first); alias: "depends_on"
- ${RELATIONSHIP_TYPES.CHILD_OF}     / "child_of"      — this issue blocks target (target can't proceed until this is done); alias: "blocks"
- ${RELATIONSHIP_TYPES.HAS_DUPLICATE} / "has_duplicate" — this issue has target as a duplicate

Directionality note: "A child_of B" means A blocks B. "A parent_of B" means A depends on B.

Dash variants (e.g. "related-to") are also accepted for type_name.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('The source issue ID (the one the relationship is added to)'),
        target_id: z.coerce.number().int().positive().describe('The target issue ID'),
        type_id: z.coerce.number().int().min(0).max(4).optional().describe(
          'Relationship type ID: 0=duplicate_of, 1=related_to, 2=parent_of (depends on), 3=child_of (blocks), 4=has_duplicate. Use either type_id or type_name.'
        ),
        type_name: z.string().optional().describe(
          'Relationship type name as alternative to type_id. Accepted: "duplicate_of", "related_to", "parent_of" (or "depends_on"), "child_of" (or "blocks"), "has_duplicate". Dash variants (e.g. "related-to") also work.'
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ issue_id, target_id, type_id, type_name }) => {
      // Resolve type_id from type_name when type_id is not provided
      let resolvedTypeId = type_id;
      if (resolvedTypeId === undefined) {
        if (type_name === undefined) {
          return { content: [{ type: 'text', text: errorText('Either type_id or type_name must be provided') }], isError: true };
        }
        const normalized = type_name.toLowerCase().replace(/-/g, '_');
        resolvedTypeId = RELATIONSHIP_NAME_TO_ID[normalized];
        if (resolvedTypeId === undefined) {
          return {
            content: [{ type: 'text', text: errorText(`Unknown relationship type name: "${type_name}". Valid values: duplicate_of, related_to, parent_of, child_of, has_duplicate`) }],
            isError: true,
          };
        }
      }

      try {
        const body = {
          issue: { id: target_id },
          type: { id: resolvedTypeId },
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
        issue_id: z.coerce.number().int().positive().describe('The issue ID the relationship belongs to'),
        relationship_id: z.coerce.number().int().positive().describe('The numeric ID of the relationship to remove (from the relationships array in get_issue)'),
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
