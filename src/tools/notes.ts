import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient, buildNoteViewUrl } from '../client.js';
import type { MantisNote } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { firstIssue, type IssueEnvelope } from '../issue-envelope.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

// Shared with update_issue (note parameter) — posts a note and returns it enriched with view_url.
export async function postNote(
  client: MantisClient,
  issueId: number,
  text: string,
  viewState: 'public' | 'private',
): Promise<MantisNote> {
  const body = {
    text,
    view_state: { name: viewState },
  };
  const [result, baseUrl] = await Promise.all([
    client.post<{ note: MantisNote }>(`issues/${issueId}/notes`, body),
    client.getBaseUrl(),
  ]);
  const note = result.note ?? (result as unknown as MantisNote);
  return { ...note, view_url: buildNoteViewUrl(baseUrl, issueId, note.id) };
}

// ---------------------------------------------------------------------------
// Note edits via PATCH /issues/{id} (update_issue fields.notes)
// ---------------------------------------------------------------------------

// Edit of an existing note. Without id MantisBT would create a new note, so
// id is required here.
const noteEdit = z.object({
  id: z.coerce.number().int().positive().describe('ID of the note to edit (from get_issue or list_notes)'),
  text: z.string().min(1).optional().describe('New note text'),
  view_state: z.enum(['public', 'private']).optional().describe('New visibility; omitted = keep the current one'),
}).strict().refine(e => e.text !== undefined || e.view_state !== undefined, { message: "A note edit needs 'text' or 'view_state'" });

export type NoteEdit = z.infer<typeof noteEdit>;

/** Schema of update_issue fields.notes. */
export const noteEditsSchema = z.array(noteEdit).min(1).superRefine((edits, ctx) => {
  const ids = edits.map(e => e.id);
  const twice = ids.filter((noteId, i) => ids.indexOf(noteId) !== i);
  if (twice.length > 0) ctx.addIssue({ code: 'custom', message: `Note ${twice.join(', ')} listed more than once` });
});

/** A note edit as sent to MantisBT — view_state is always set. */
export interface NotePatch {
  id: number;
  text?: string;
  view_state: { name: string };
}

/**
 * Turns note edits into the PATCH payload. MantisBT has no REST route for
 * editing a note, but PATCH /issues/{id} edits notes by id. The current notes
 * are read first: unknown IDs throw before anything is written, and a
 * missing view_state is filled with the note's current one, so an edit keeps
 * the note's visibility unless the caller changes it.
 */
export async function prepareNoteEdits(
  client: MantisClient,
  issueId: number,
  edits: NoteEdit[],
): Promise<NotePatch[]> {
  const result = await client.get<IssueEnvelope>(`issues/${issueId}`, { select: 'id,notes' });
  const current = new Map((firstIssue(result)?.notes ?? []).map(n => [n.id, n]));
  const unknown = edits.filter(e => !current.has(e.id)).map(e => e.id);
  if (unknown.length > 0) {
    throw new Error(`Note(s) ${unknown.join(', ')} do not belong to issue ${issueId} or are not visible to you — use list_notes to look up note IDs.`);
  }
  return edits.map(({ id, text, view_state }) => ({
    id,
    ...(text !== undefined && { text }),
    view_state: { name: view_state ?? current.get(id)!.view_state?.name ?? 'public' },
  }));
}

const normalizeText = (text: string): string => text.replace(/\r\n/g, '\n').trim();

/** Compares the notes in the PATCH response with the edits; returns one message per edit MantisBT did not apply. */
export function verifyNoteEdits(edits: NotePatch[], notes: MantisNote[] | undefined): string[] {
  const byId = new Map((notes ?? []).map(n => [n.id, n]));
  return edits.flatMap(edit => {
    const note = byId.get(edit.id);
    if (!note) return [`note ${edit.id} is missing from the updated issue`];
    const problems: string[] = [];
    if (edit.text !== undefined && normalizeText(note.text) !== normalizeText(edit.text)) {
      problems.push(`the text of note ${edit.id} was not changed`);
    }
    if (note.view_state?.name !== edit.view_state.name) {
      problems.push(`note ${edit.id} is ${note.view_state?.name ?? 'unknown'} instead of ${edit.view_state.name}`);
    }
    return problems;
  });
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
          client.get<IssueEnvelope>(`issues/${issue_id}`),
          client.getBaseUrl(),
        ]);
        const notes = (firstIssue(result)?.notes ?? []).map(note => ({
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
        const note = await postNote(client, issue_id, text, view_state);
        return {
          content: [{ type: 'text', text: JSON.stringify(note, null, 2) }],
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
