import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MantisClient } from '../client.js';
import type { MantisPaginatedIssues } from '../types.js';
import type { VectorStore } from './store.js';
import type { Embedder } from './embedder.js';
import { SearchSyncService } from './sync.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

// ---------------------------------------------------------------------------
// registerSearchTools
// ---------------------------------------------------------------------------

export function registerSearchTools(
  server: McpServer,
  client: MantisClient,
  store: VectorStore,
  embedder: Embedder,
): void {

  // ---------------------------------------------------------------------------
  // search_issues
  // ---------------------------------------------------------------------------

  server.registerTool(
    'search_issues',
    {
      title: 'Semantic Issue Search',
      description:
        'Search MantisBT issues using natural language. Returns the most relevant issues ' +
        'by semantic similarity. The search index must be populated first via rebuild_search_index.',
      inputSchema: z.object({
        query: z.string().describe('Natural language search query'),
        top_n: z
          .coerce.number()
          .int()
          .positive()
          .max(50)
          .default(10)
          .describe('Number of results to return (default: 10, max: 50)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ query, top_n }) => {
      try {
        const count = await store.count();
        if (count === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Search index is empty. Run rebuild_search_index first.',
              },
            ],
            isError: true,
          };
        }

        const queryVector = await embedder.embed(query);
        const results = await store.search(queryVector, top_n);

        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // get_search_index_status
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_search_index_status',
    {
      title: 'Search Index Status',
      description:
        'Returns the current fill level of the semantic search index: how many issues are ' +
        'indexed vs. the total number of issues in MantisBT, plus the timestamp of the last sync.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const [indexed, lastSyncedAt, totalResponse] = await Promise.all([
          store.count(),
          store.getLastSyncedAt(),
          client.get<MantisPaginatedIssues>('issues', { page_size: 1, page: 1 }),
        ]);

        const total = totalResponse.total_count ?? null;
        const percent = total !== null
          ? (total > 0 ? Math.round((indexed / total) * 100) : 0)
          : null;

        const summary = total !== null
          ? `${indexed}/${total} (${percent} %)`
          : `${indexed}/? (total unknown)`;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { summary, indexed, total, percent, last_synced_at: lastSyncedAt },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // rebuild_search_index
  // ---------------------------------------------------------------------------

  server.registerTool(
    'rebuild_search_index',
    {
      title: 'Rebuild Semantic Search Index',
      description:
        'Build or update the semantic search index for MantisBT issues. ' +
        'Use full: true to clear the existing index and rebuild from scratch.',
      inputSchema: z.object({
        project_id: z
          .coerce.number()
          .int()
          .positive()
          .optional()
          .describe('Optional: only index issues from this project'),
        full: z
          .boolean()
          .default(false)
          .describe('If true, clears the existing index and rebuilds from scratch'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, full }) => {
      try {
        if (full) {
          await store.clear();
          await store.resetLastSyncedAt();
        }

        const startMs = Date.now();
        const syncService = new SearchSyncService(client, store, embedder);
        const { indexed, skipped } = await syncService.sync(project_id);
        const duration_ms = Date.now() - startMs;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ indexed, skipped, duration_ms }, null, 2),
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    },
  );
}
