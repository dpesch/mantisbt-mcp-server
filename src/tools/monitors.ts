import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisUser } from '../types.js';
import { firstIssue, type IssueEnvelope } from '../issue-envelope.js';
import { getVersionHint } from '../version-hint.js';
import { deprecationNote } from '../deprecation.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(msg: string) {
  return { content: [{ type: 'text' as const, text: errorText(msg) }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Monitor helpers
// ---------------------------------------------------------------------------


/** MantisBT omits the "monitors" key when the issue has no monitors. */
const monitorsOf = (response: IssueEnvelope | undefined): MantisUser[] =>
  firstIssue(response)?.monitors ?? [];

/** Lower-cased login names of the given monitors (MantisBT login names are case-insensitive). */
const loginsOf = (monitors: MantisUser[]): Set<string> =>
  new Set(monitors.map(m => m.name.toLowerCase()));

export interface AddMonitorsResult {
  /** Requested login names that are monitors after the POST. */
  added: string[];
  /** Requested login names MantisBT did not add. */
  notAdded: string[];
  /** Monitors of the issue after the operation. */
  monitors: MantisUser[];
}

/**
 * Adds users as monitors of an issue.
 *
 * MantisBT reads only a "users" array; without it, MonitorAddCommand adds the
 * logged-in user (the API-key owner) instead. The POST response contains the
 * issue, so the result is checked without an extra request. Adding an existing
 * monitor is a no-op and counts as added.
 */
export async function addMonitors(
  client: MantisClient,
  issueId: number,
  usernames: string[],
): Promise<AddMonitorsResult> {
  const monitors = monitorsOf(
    await client.post<IssueEnvelope>(`issues/${issueId}/monitors`, {
      users: usernames.map(name => ({ name })),
    }),
  );
  const present = loginsOf(monitors);
  return {
    added: usernames.filter(u => present.has(u.toLowerCase())),
    notAdded: usernames.filter(u => !present.has(u.toLowerCase())),
    monitors,
  };
}

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
 *
 * `knownMonitors` skips the initial GET when the caller already has the
 * current monitor list (e.g. from a preceding addMonitors call).
 */
export async function removeMonitors(
  client: MantisClient,
  issueId: number,
  usernames: string[],
  knownMonitors?: MantisUser[],
): Promise<RemoveMonitorsResult> {
  const wanted = new Set(usernames.map(u => u.toLowerCase()));
  const isWanted = (m: MantisUser) => wanted.has(m.name.toLowerCase());

  const current = knownMonitors ?? monitorsOf(
    await client.get<IssueEnvelope>(`issues/${issueId}`, { select: 'id,monitors' }),
  );
  const present = loginsOf(current.filter(isWanted));
  const notMonitoring = usernames.filter(u => !present.has(u.toLowerCase()));

  if (present.size === 0) {
    return { removed: [], notMonitoring, stillPresent: [], monitors: current };
  }

  const after = monitorsOf(
    await client.patch<IssueEnvelope>(`issues/${issueId}`, {
      monitors: current.filter(m => !isWanted(m)).map(m => ({ id: m.id })),
    }),
  );
  const kept = loginsOf(after);
  const requested = usernames.filter(u => present.has(u.toLowerCase()));

  return {
    removed: requested.filter(u => !kept.has(u.toLowerCase())),
    notMonitoring,
    stillPresent: requested.filter(u => kept.has(u.toLowerCase())),
    monitors: after,
  };
}

const NOT_ADDED_HINT = 'adding other users requires the monitor_add_others_bug_threshold access level';
const STILL_PRESENT_HINT = 'removing other users requires the monitor_delete_others_bug_threshold access level';

export interface MonitorChanges {
  added?: string[];
  removed?: string[];
  not_monitoring?: string[];
  current: string[];
}

/**
 * Applies a combined add/remove of monitors (update_issue add_monitors /
 * remove_monitors). Never throws: API errors and changes MantisBT silently
 * skipped are returned as `problems`. Adds run first; the resulting monitor
 * list is reused for the removal, so no extra GET is needed. `knownMonitors`
 * (e.g. from a preceding field PATCH) skips the GET when only removing.
 */
export async function applyMonitorChanges(
  client: MantisClient,
  issueId: number,
  add: string[] | undefined,
  remove: string[] | undefined,
  knownMonitors?: MantisUser[],
): Promise<{ changes?: MonitorChanges; problems: string[] }> {
  const changes: MonitorChanges = { current: [] };
  const problems: string[] = [];
  try {
    let known = knownMonitors;
    if (add) {
      const result = await addMonitors(client, issueId, add);
      changes.added = result.added;
      changes.current = result.monitors.map(m => m.name);
      known = result.monitors;
      if (result.notAdded.length > 0) {
        problems.push(`MantisBT did not add ${result.notAdded.join(', ')} as monitor(s) — ${NOT_ADDED_HINT}.`);
      }
    }
    if (remove) {
      const result = await removeMonitors(client, issueId, remove, known);
      changes.removed = result.removed;
      changes.not_monitoring = result.notMonitoring;
      changes.current = result.monitors.map(m => m.name);
      if (result.stillPresent.length > 0) {
        problems.push(`${result.stillPresent.join(', ')} still monitor(s) the issue — ${STILL_PRESENT_HINT}.`);
      }
    }
    return { changes, problems };
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
    return { problems };
  }
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
      description: `${deprecationNote('add_monitor', 'update_issue with add_monitors')}

Add a user as a monitor (watcher) of a MantisBT issue. Monitors receive email notifications whenever the issue is updated. Returns { success, monitors } — "monitors" lists the login names now monitoring the issue.

Use it to subscribe team members to issue updates without assigning them as the handler.

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
        const result = await addMonitors(client, issue_id, [username]);
        if (result.notAdded.length > 0) {
          return errorResult(`MantisBT accepted the request, but user "${username}" is not a monitor of issue ${issue_id}.`);
        }
        return jsonResult({ success: true, monitors: result.monitors.map(m => m.name) });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
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
      description: `${deprecationNote('remove_monitor', 'update_issue with remove_monitors')}

Remove a user from the monitor list of a MantisBT issue. The user will no longer receive email notifications for updates to this issue.

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
          return errorResult(`User "${username}" is still a monitor of issue ${issue_id}. MantisBT silently skipped the removal — ${STILL_PRESENT_HINT}.`);
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
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
