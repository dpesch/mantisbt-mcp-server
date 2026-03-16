import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { MetadataCache } from '../cache.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

// Parse a MantisBT enum string ("10:feature,20:trivial,...") into {id, name}[]
function parseEnumString(raw: string): Array<{ id: number; name: string }> {
  return raw
    .split(',')
    .map((entry) => {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) return null;
      const id = parseInt(entry.slice(0, colonIdx), 10);
      const name = entry.slice(colonIdx + 1).trim();
      return isNaN(id) ? null : { id, name };
    })
    .filter((e): e is { id: number; name: string } => e !== null);
}

export function registerConfigTools(server: McpServer, client: MantisClient, cache: MetadataCache): void {

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
  // get_issue_enums
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_issue_enums',
    {
      title: 'Get Issue Enum Values',
      description: `Return valid ID and name pairs for all issue enum fields.

Use this tool before creating or updating issues to look up the correct value
for severity, status, priority, resolution, or reproducibility.

Example response:
{
  "severity":         [{"id": 10, "name": "feature"}, {"id": 50, "name": "minor"}, ...],
  "status":           [{"id": 10, "name": "new"}, {"id": 20, "name": "feedback"}, ...],
  "priority":         [{"id": 10, "name": "none"}, {"id": 30, "name": "normal"}, ...],
  "resolution":       [{"id": 10, "name": "open"}, {"id": 20, "name": "fixed"}, ...],
  "reproducibility":  [{"id": 10, "name": "always"}, {"id": 70, "name": "have not tried"}, ...]
}

The "name" field is the value to pass to create_issue or update_issue.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const enumOptions = [
          'severity_enum_string',
          'status_enum_string',
          'priority_enum_string',
          'resolution_enum_string',
          'reproducibility_enum_string',
        ];
        const params: Record<string, string | number | boolean | undefined> = {};
        enumOptions.forEach((opt, i) => {
          params[`option[${i}]`] = opt;
        });

        const result = await client.get<{ configs: Array<{ option: string; value: string }> }>('config', params);
        const configs = result.configs ?? [];

        const keyMap: Record<string, string> = {
          severity_enum_string: 'severity',
          status_enum_string: 'status',
          priority_enum_string: 'priority',
          resolution_enum_string: 'resolution',
          reproducibility_enum_string: 'reproducibility',
        };

        const enums: Record<string, Array<{ id: number; name: string }>> = {};
        for (const { option, value } of configs) {
          const key = keyMap[option];
          if (key && typeof value === 'string') {
            enums[key] = parseEnumString(value);
          }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(enums, null, 2) }],
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

The MantisBT REST API exposes a GET /tags endpoint on some installations.
If that endpoint is not available, this tool falls back to the local metadata
cache populated by sync_metadata.`,
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
        if (msg.includes('404')) {
          // GET /tags endpoint not available — fall back to metadata cache
          const metadata = await cache.load();
          if (metadata && Array.isArray(metadata.tags) && metadata.tags.length > 0) {
            const start = (page - 1) * page_size;
            const paginated = metadata.tags.slice(start, start + page_size);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ tags: paginated, source: 'cache' }, null, 2),
              }],
            };
          }
          return {
            content: [{
              type: 'text',
              text: `Error: ${msg}\n\nThe GET /tags endpoint is not available in this MantisBT installation. No cached tags found either — run sync_metadata to populate the cache if your installation provides this endpoint.`,
            }],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
