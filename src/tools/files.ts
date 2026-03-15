import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisFile } from '../types.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerFileTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // list_issue_files
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_issue_files',
    {
      title: 'List Issue File Attachments',
      description: 'List all file attachments of a MantisBT issue.',
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric issue ID'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ issue_id }) => {
      try {
        const result = await client.get<{ issues: Array<{ attachments?: MantisFile[] }> }>(`issues/${issue_id}`);
        const attachments = result.issues?.[0]?.attachments ?? [];
        return {
          content: [{ type: 'text', text: JSON.stringify(attachments, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
