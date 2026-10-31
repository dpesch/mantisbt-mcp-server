import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisIssue, MantisUser } from '../types.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Monitor removal via PATCH
// ---------------------------------------------------------------------------

type IssuesResponse = { issues?: MantisIssue[] };

const monitorsOf = (response: IssuesResponse | undefined): MantisUser[] =>
  response?.issues?.[0]?.monitors ?? [];

export interface RemoveMonitorsResult {
  /** Login names that were monitors and are gone after the PATCH. */
  removed: string[];
  /** Requested login names that were not monitoring the issue (nothing to do). */
  notMonitoring: string[];
  /** Requested login names MantisBT silently kept (missing permission). */
  stillPresent: string[];
  /** Monitors of the issue after the operation. */
  monitors: MantisUser[];
}

/**
 * Removes users from an issue's monitor list.
 *
 * MantisBT 2.28 has no DELETE route for monitors. PATCH /issues/{id} replaces
 * the monitor list as a whole, so the list is sent without the given users.
 * MantisBT skips monitors the caller may not remove without reporting an
 * error — those end up in `stillPresent`. Usernames are matched
 * case-insensitively. No PATCH is sent when none of the users is a monitor.
 */
export async function removeMonitors(
  client: MantisClient,
  issueId: number,
  usernames: string[],
): Promise<RemoveMonitorsResult> {
  const wanted = new Set(usernames.map(u => u.toLowerCase()));
  const isWanted = (m: MantisUser) => wanted.has(m.name.toLowerCase());

  const current = monitorsOf(
    await client.get<IssuesResponse>(`issues/${issueId}`, { select: 'id,monitors' }),
  );
  const present = new Set(current.filter(isWanted).map(m => m.name.toLowerCase()));
  const notMonitoring = usernames.filter(u => !present.has(u.toLowerCase()));

  if (present.size === 0) {
    return { removed: [], notMonitoring, stillPresent: [], monitors: current };
  }

  const after = monitorsOf(
    await client.patch<IssuesResponse>(`issues/${issueId}`, {
      monitors: current.filter(m => !isWanted(m)).map(m => ({ id: m.id })),
    }),
  );
  const kept = new Set(after.filter(isWanted).map(m => m.name.toLowerCase()));
  const requested = usernames.filter(u => present.has(u.toLowerCase()));

  return {
    removed: requested.filter(u => !kept.has(u.toLowerCase())),
    notMonitoring,
    stillPresent: requested.filter(u => kept.has(u.toLowerCase())),
    monitors: after,
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function registerMonitorTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // add_monitor
  // ---------------------------------------------------------------------------

  server.registerTool(
    'add_monitor',
    {
      title: 'Add Issue Monitor',
      description: `Add a user as a monitor (watcher) of a MantisBT issue. Monitors receive email notifications whenever the issue is updated. Returns a success confirmation object.

Use add_monitor to subscribe team members to issue updates without assigning them as the handler. To unsubscribe a user, call remove_monitor with the same parameters.

Adding a user who is already a monitor is a no-op — the operation succeeds without creating duplicates.

Prerequisites: obtain issue_id from list_issues or get_issue; use find_project_member or get_project_users to look up valid MantisBT login names.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID — use list_issues or get_issue to obtain issue IDs'),
        username: z.string().min(1).describe('MantisBT login name (not the display name) of the user to add as monitor. Use find_project_member or get_project_users to discover valid login names for a project.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ issue_id, username }) => {
      try {
        const body = { name: username };
        const result = await client.post<unknown>(`issues/${issue_id}/monitors`, body);
        return jsonResult(result ?? { success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // remove_monitor
  // ---------------------------------------------------------------------------

  server.registerTool(
    'remove_monitor',
    {
      title: 'Remove Issue Monitor',
      description: `Remove a user from the monitor list of a MantisBT issue. The user will no longer receive email notifications for updates to this issue.

Returns { success, removed, monitors } — "monitors" lists the login names still monitoring the issue. If the user was not a monitor, the call succeeds with removed=false and nothing is changed.

Removing another user requires the monitor_delete_others_bug_threshold access level; without it the call returns an error.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
        username: z.string().min(1).describe('MantisBT login name (not the display name) of the monitor to remove'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ issue_id, username }) => {
      try {
        const result = await removeMonitors(client, issue_id, [username]);
        const monitors = result.monitors.map(m => m.name);

        if (result.stillPresent.length > 0) {
          return {
            content: [{
              type: 'text',
              text: errorText(`User "${username}" is still a monitor of issue ${issue_id}. MantisBT silently skipped the removal — removing other users requires the monitor_delete_others_bug_threshold access level.`),
            }],
            isError: true,
          };
        }

        if (result.removed.length === 0) {
          return jsonResult({
            success: true,
            removed: false,
            message: `User "${username}" is not a monitor of issue ${issue_id} — nothing changed.`,
            monitors,
          });
        }

        return jsonResult({ success: true, removed: true, monitors });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
