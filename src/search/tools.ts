import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MantisClient } from '../client.js';
import type { VectorStore } from './store.js';
import type { Embedder } from './embedder.js';
import { SearchSyncService } from './sync.js';
import { getVersionHint } from '../version-hint.js';
import { dateFilterSchema, matchesDateFilter, hasDateFilter, type DateFilter } from '../date-filter.js';
import { extractTerms, highlightText, extractSnippet, hasTermMatch } from './highlight.js';

function buildHighlights(
  summary: string | undefined,
  description: string | undefined,
  terms: string[],
): Record<string, string> | null {
  const h: Record<string, string> = {};
  if (summary) {
    const highlighted = highlightText(summary, terms);
    if (highlighted !== summary) h['summary'] = highlighted;
  }
  if (description && hasTermMatch(description, terms)) {
    h['description'] = extractSnippet(description, terms);
  }
  return Object.keys(h).length > 0 ? h : null;
}

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

// ---------------------------------------------------------------------------
// registerSearchTools
// ---------------------------------------------------------------------------

const coerceBool = (val: unknown) =>
  val === 'true' ? true : val === 'false' ? false : val;

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
        select: z.string().optional().describe(
          'Comma-separated list of fields to include for each result (e.g. "id,summary,status,handler,priority"). ' +
          'When provided, each matching issue is fetched from MantisBT and enriched with the requested fields. ' +
          'The relevance score is always included. Without this parameter only id and score are returned.'
        ),
        highlight: z
          .preprocess(coerceBool, z.boolean())
          .default(false)
          .describe(
            'If true, adds a "highlights" field per result with query terms bolded (**term**) ' +
            'in the issue summary and a short description snippet. ' +
            'Note: highlights are keyword-based, not semantic — some results may have no highlighted terms.'
          ),
        ...dateFilterSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ query, top_n, select, highlight, updated_after, updated_before, created_after, created_before }) => {
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

        const dateFilter: DateFilter = { updated_after, updated_before, created_after, created_before };
        const filterActive = hasDateFilter(dateFilter);
        const terms = highlight ? extractTerms(query) : [];
        const queryVector = await embedder.embed(query);
        const results = await store.search(queryVector, top_n);

        if (!select) {
          // For filtering or highlighting we need store metadata per result
          if (!filterActive && !terms.length) {
            return {
              content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
            };
          }
          const filtered = await Promise.all(
            results.map(async ({ id, score }) => {
              const item = await store.getItem(id);
              if (filterActive && !matchesDateFilter(item?.metadata ?? {}, dateFilter)) return null;
              const result: Record<string, unknown> = { id, score };
              if (terms.length > 0 && item) {
                const h = buildHighlights(item.metadata.summary, item.metadata.description, terms);
                if (h) result['highlights'] = h;
              }
              return result;
            })
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(filtered.filter(Boolean), null, 2) }],
          };
        }

        const fields = select.split(',').map(f => f.trim()).filter(Boolean);
        const enriched = await Promise.all(
          results.map(async ({ id, score }) => {
            try {
              const issueResult = await client.get<{ issues: Array<Record<string, unknown>> }>(`issues/${id}`);
              const issue = issueResult.issues?.[0] ?? {};
              if (filterActive && !matchesDateFilter(issue as { updated_at?: string; created_at?: string }, dateFilter)) {
                return null;
              }
              const projected: Record<string, unknown> = { id, score };
              for (const field of fields) {
                if (field !== 'id' && field in issue) {
                  projected[field] = issue[field];
                }
              }
              if (terms.length > 0) {
                const summary = typeof issue['summary'] === 'string' ? issue['summary'] : undefined;
                const description = typeof issue['description'] === 'string' ? issue['description'] : undefined;
                const h = buildHighlights(summary, description, terms);
                if (h) projected['highlights'] = h;
              }
              return projected;
            } catch {
              const result: Record<string, unknown> = { id, score };
              if (terms.length > 0) {
                const item = await store.getItem(id);
                if (item) {
                  const h = buildHighlights(item.metadata.summary, item.metadata.description, terms);
                  if (h) result['highlights'] = h;
                }
              }
              return result;
            }
          })
        );

        return {
          content: [{ type: 'text', text: JSON.stringify(enriched.filter(Boolean), null, 2) }],
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
        const [indexed, lastSyncedAt, total] = await Promise.all([
          store.count(),
          store.getLastSyncedAt(),
          store.getLastKnownTotal(),
        ]);

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
        const { indexed, skipped, total } = await syncService.sync(project_id);
        const duration_ms = Date.now() - startMs;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ indexed, skipped, total, duration_ms }, null, 2),
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
