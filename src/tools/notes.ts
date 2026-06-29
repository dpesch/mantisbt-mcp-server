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
      description: `Add a note (comment) to an existing MantisBT issue. Returns the created note object including id, created_at, reporter, text, view_state, and a view_url linking directly to the note in the MantisBT web UI.

Full UTF-8 text is supported. Markdown syntax is stored as-is — rendering depends on the MantisBT instance's configured text renderer.

Use view_state="private" to restrict the note to users with reporter-level access or higher; public notes are visible to all users who can view the issue.

Prerequisites: obtain issue_id from list_issues, get_issue, or search_issues.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID — use list_issues or get_issue to obtain issue IDs'),
        text: z.string().min(1).describe('Note text (minimum 1 character). Full UTF-8 including emoji is supported. Markdown is stored as-is.'),
        view_state: z.enum(['public', 'private']).default('public').describe('Visibility of the note: "public" (visible to all, default) or "private" (visible only to users with sufficient access level).'),
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
      description: `Permanently delete a note from a MantisBT issue. This action is irreversible — deleted notes cannot be recovered.

Returns a plain-text confirmation message on success. Returns an error if the note does not exist or the current user lacks permission to delete it (MantisBT enforces access control: users can typically only delete their own notes unless they have manager-level access or higher).

Prerequisites: obtain note_id from list_notes or from get_issue (notes[].id); obtain issue_id from the same source.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID that owns the note — use get_issue or list_notes to identify this value'),
        note_id: z.coerce.number().int().positive().describe('Numeric note ID to delete — obtain from get_issue (notes[].id) or list_notes'),
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
