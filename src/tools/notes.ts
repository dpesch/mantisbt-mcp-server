import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient, buildNoteViewUrl } from '../client.js';
import type { MantisNote } from '../types.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerNoteTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // list_notes
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_notes',
    {
      title: 'List Issue Notes',
      description: 'List all notes (comments) attached to a MantisBT issue. Note: get_issue already includes notes in its response — use list_notes only when you need notes without fetching the full issue.',
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ issue_id }) => {
      try {
        const [result, baseUrl] = await Promise.all([
          client.get<{ issues: Array<{ notes?: MantisNote[] }> }>(`issues/${issue_id}`),
          client.getBaseUrl(),
        ]);
        const notes = (result.issues?.[0]?.notes ?? []).map(note => ({
          ...note,
          view_url: buildNoteViewUrl(baseUrl, issue_id, note.id),
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // add_note
  // ---------------------------------------------------------------------------

  server.registerTool(
    'add_note',
    {
      title: 'Add Note to Issue',
      description: 'Add a note (comment) to an existing MantisBT issue. Full UTF-8 text is supported.',
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
        text: z.string().min(1).describe('Note text (supports full UTF-8, markdown will be stored as-is)'),
        view_state: z.enum(['public', 'private']).default('public').describe('Visibility of the note (default: public)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ issue_id, text, view_state }) => {
      try {
        const body = {
          text,
          view_state: { name: view_state },
        };
        const [result, baseUrl] = await Promise.all([
          client.post<{ note: MantisNote }>(`issues/${issue_id}/notes`, body),
          client.getBaseUrl(),
        ]);
        const note = result.note ?? (result as unknown as MantisNote);
        return {
          content: [{ type: 'text', text: JSON.stringify(
            { ...note, view_url: buildNoteViewUrl(baseUrl, issue_id, note.id) },
            null, 2,
          ) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // delete_note
  // ---------------------------------------------------------------------------

  server.registerTool(
    'delete_note',
    {
      title: 'Delete Note',
      description: 'Permanently delete a note from a MantisBT issue. This action is irreversible.',
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID that owns the note'),
        note_id: z.coerce.number().int().positive().describe('Numeric note ID to delete'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ issue_id, note_id }) => {
      try {
        await client.delete<unknown>(`issues/${issue_id}/notes/${note_id}`);
        return {
          content: [{ type: 'text', text: `Note #${note_id} deleted from issue #${issue_id}.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
