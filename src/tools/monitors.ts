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

export function registerMonitorTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // add_monitor
  // ---------------------------------------------------------------------------

  server.registerTool(
    'add_monitor',
    {
      title: 'Add Issue Monitor',
      description: 'Add a user as a monitor (watcher) of a MantisBT issue. Monitors receive email notifications for issue updates.',
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
        username: z.string().min(1).describe('Username of the user to add as monitor'),
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
        return {
          content: [{ type: 'text', text: JSON.stringify(result ?? { success: true }, null, 2) }],
        };
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
      description: 'Remove a user from the monitor list of a MantisBT issue. The user will no longer receive email notifications for updates to this issue.',
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
        username: z.string().min(1).describe('Username of the monitor to remove'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ issue_id, username }) => {
      try {
        await client.delete<unknown>(`issues/${issue_id}/monitors/${username}`);
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
