import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MantisClient } from '../client.js';
import type { SearchConfig } from '../config.js';
import { createVectorStore } from './store.js';
import { Embedder } from './embedder.js';
import { registerSearchTools, getSearchIndexStatus } from './tools.js';
import type { SearchIndexStatus } from '../types.js';
import { SearchSyncService, SyncLockedError } from './sync.js';

// ---------------------------------------------------------------------------
// initializeSearchModule
// ---------------------------------------------------------------------------

export async function initializeSearchModule(
  server: McpServer,
  client: MantisClient,
  config: SearchConfig,
): Promise<() => Promise<SearchIndexStatus>> {
  const store = createVectorStore(config.backend, config.dir);
  const embedder = new Embedder(config.modelName, config.numThreads);

  registerSearchTools(server, client, store, embedder, config.dir);

  // Pre-initialize lastKnownTotal so the index status (get_metadata) shows a value
  // immediately on startup, even while the background sync is still running.
  // count() loads the whole index into memory, and this runs before the server
  // connects — so only do it when there is no stored total yet.
  if (await store.getLastKnownTotal() === null) {
    const startupCount = await store.count();
    if (startupCount > 0) await store.setLastKnownTotal(startupCount);
  }

  // Non-blocking background sync on startup. If another server process (another
  // client session) is already syncing the shared index, this one skips it.
  const syncService = new SearchSyncService(client, store, embedder, config.dir);
  syncService.sync().catch((err: unknown) => {
    if (err instanceof SyncLockedError) {
      console.error('[mantisbt-search] another process is syncing the index, skipping startup sync');
      return;
    }
    console.error(
      '[mantisbt-search] sync error:',
      err instanceof Error ? err.message : String(err),
    );
  });

  return () => getSearchIndexStatus(store);
}
