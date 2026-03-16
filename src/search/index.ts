import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MantisClient } from '../client.js';
import type { SearchConfig } from '../config.js';
import { createVectorStore } from './store.js';
import { Embedder } from './embedder.js';
import { registerSearchTools } from './tools.js';
import { SearchSyncService } from './sync.js';

// ---------------------------------------------------------------------------
// initializeSearchModule
// ---------------------------------------------------------------------------

export async function initializeSearchModule(
  server: McpServer,
  client: MantisClient,
  config: SearchConfig,
): Promise<void> {
  if (!config.enabled) return;

  const store = createVectorStore(config.backend, config.dir);
  const embedder = new Embedder(config.modelName);

  registerSearchTools(server, client, store, embedder);

  // Pre-initialize lastKnownTotal so get_search_index_status shows a value
  // immediately on startup, even while the background sync is still running.
  const [startupCount, startupTotal] = await Promise.all([store.count(), store.getLastKnownTotal()]);
  if (startupTotal === null && startupCount > 0) {
    await store.setLastKnownTotal(startupCount);
  }

  // Non-blocking background sync on startup
  const syncService = new SearchSyncService(client, store, embedder);
  syncService.sync().catch((err: unknown) => {
    console.error(
      '[mantisbt-search] sync error:',
      err instanceof Error ? err.message : String(err),
    );
  });
}
