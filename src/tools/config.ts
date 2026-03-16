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

export function registerConfigTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // get_config
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_config',
    {
      title: 'Get MantisBT Configuration',
      description: `Retrieve one or more MantisBT configuration options.

Common option names:
- "status_enum_string" — issue status values and their IDs
- "priority_enum_string" — priority values
- "severity_enum_string" — severity values
- "resolution_enum_string" — resolution values
- "reproducibility_enum_string" — reproducibility values
- "view_state_enum_string" — view state values
- "access_levels_enum_string" — access level values`,
      inputSchema: z.object({
        options: z.array(z.string()).min(1).describe('Array of configuration option names to retrieve'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ options }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        options.forEach((opt, i) => {
          params[`option[${i}]`] = opt;
        });
        const result = await client.get<unknown>('config', params);
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
  // list_languages
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_languages',
    {
      title: 'List Supported Languages',
      description: 'List all languages supported by the MantisBT installation.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const result = await client.get<unknown>('lang');
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
  // list_tags
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_tags',
    {
      title: 'List Tags',
      description: `List all tags defined in the MantisBT installation.

Note: The GET /tags endpoint is not available in MantisBT 2.25 and earlier.
If your MantisBT version does not support this endpoint, you will receive an error.
In that case, use get_issue to read the tags of a specific issue instead.`,
      inputSchema: z.object({
        page: z.coerce.number().int().positive().default(1).describe('Page number (default: 1)'),
        page_size: z.coerce.number().int().min(1).max(200).default(50).describe('Tags per page (default: 50)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ page, page_size }) => {
      try {
        const result = await client.get<unknown>('tags', { page, page_size });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const hint = msg.includes('404')
          ? `${msg}\n\nThe GET /tags endpoint is not supported by this MantisBT version. Use get_issue to read tags of a specific issue instead.`
          : msg;
        return { content: [{ type: 'text', text: `Error: ${hint}` }], isError: true };
      }
    }
  );
}
