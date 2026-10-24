import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisFilter } from '../types.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerFilterTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // list_filters
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_filters',
    {
      title: 'List Saved Filters',
      description: 'List all saved MantisBT issue filters accessible to the current user. Filter IDs can be used with list_issues.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const result = await client.get<{ filters: MantisFilter[] } | MantisFilter[]>('filters');
        const filters = Array.isArray(result) ? result : result.filters ?? result;
        return {
          content: [{ type: 'text', text: JSON.stringify(filters, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
