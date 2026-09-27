import type { MantisClient } from '../client.js';
import type { VectorStore, VectorStoreItem } from './store.js';
import type { Embedder } from './embedder.js';

// ---------------------------------------------------------------------------
// Types for MantisBT issue list response
// ---------------------------------------------------------------------------

interface IssueListItem {
  id: number;
  summary?: string;
  description?: string;
  updated_at?: string;
}

interface IssueListResponse {
  issues: IssueListItem[];
  total_count: number;
}

// ---------------------------------------------------------------------------
// SearchSyncService
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const EMBED_BATCH_SIZE = 10;
const CHECKPOINT_INTERVAL = 100; // flush to disk every N indexed issues

export class SearchSyncService {
  constructor(
    private readonly client: MantisClient,
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
  ) {}

  async sync(projectId?: number): Promise<{ indexed: number; skipped: number; total: number | null }> {
    const lastSyncedAt = await this.store.getLastSyncedAt();

    const { issues: allIssues, totalFromApi } = await this.fetchAllIssues(lastSyncedAt ?? undefined, projectId);

    let indexed = 0;
    let skipped = 0;
    let indexedSinceCheckpoint = 0;

    // Process in batches of EMBED_BATCH_SIZE
    for (let i = 0; i < allIssues.length; i += EMBED_BATCH_SIZE) {
      const batch = allIssues.slice(i, i + EMBED_BATCH_SIZE);
      const toEmbed: Array<{ issue: IssueListItem; text: string }> = [];

      for (const issue of batch) {
        if (!issue.summary) {
          skipped++;
          continue;
        }
        const text = `${issue.summary}\n${issue.description ?? ''}`.trim();
        toEmbed.push({ issue, text });
      }

      if (toEmbed.length === 0) continue;

      const vectors = await this.embedder.embedBatch(toEmbed.map(e => e.text));

      const batchItems: VectorStoreItem[] = toEmbed.map((e, j) => ({
        id: e.issue.id,
        vector: vectors[j]!,
        metadata: {
          summary: e.issue.summary!,
          description: e.issue.description,
          updated_at: e.issue.updated_at,
        },
      }));
      await this.store.addBatch(batchItems);
      indexed += batchItems.length;
      indexedSinceCheckpoint += batchItems.length;

      // Checkpoint flush: persist every CHECKPOINT_INTERVAL issues to limit
      // data loss if the process is killed before the final flush.
      if (indexedSinceCheckpoint >= CHECKPOINT_INTERVAL) {
        await this.store.flush();
        indexedSinceCheckpoint = 0;
      }
    }

    // Final flush for any remaining items not yet written by a checkpoint.
    if (indexedSinceCheckpoint > 0) {
      await this.store.flush();
    }

    await this.store.setLastSyncedAt(new Date().toISOString());

    // Persist the best known total for get_search_index_status.
    // Priority: API total_count > full-rebuild count > current store size.
    // The store size fallback handles MantisBT installations that never return
    // total_count and ensures the status tool never shows "total unknown" after
    // any sync has completed.
    const storeCount = await this.store.count();
    const total = totalFromApi ?? (lastSyncedAt === null ? indexed + skipped : storeCount);
    await this.store.setLastKnownTotal(total);

    return { indexed, skipped, total };
  }

  private async fetchAllIssues(
    updatedAfter: string | undefined,
    projectId: number | undefined,
  ): Promise<{ issues: IssueListItem[]; totalFromApi: number | null }> {
    const allIssues: IssueListItem[] = [];
    let totalFromApi: number | null = null;
    let page = 1;

    while (true) {
      const params: Record<string, string | number | boolean | undefined> = {
        page_size: PAGE_SIZE,
        page,
        sort: 'updated_at',
        direction: 'DESC',
        select: 'id,summary,description,updated_at',
      };

      if (projectId !== undefined) {
        params.project_id = projectId;
      }

      if (updatedAfter) {
        params.updated_after = updatedAfter;
      }

      const response = await this.client.get<IssueListResponse>('issues', params);
      const pageIssues = response.issues ?? [];
      allIssues.push(...pageIssues);

      // Capture total_count from the first page that provides it
      if (totalFromApi === null && response.total_count != null) {
        totalFromApi = response.total_count;
      }

      // Stop when we have fetched all issues:
      // - total_count is provided and reached, or
      // - page returned fewer items than requested (last page)
      if (totalFromApi !== null) {
        if (allIssues.length >= totalFromApi) break;
      } else if (pageIssues.length < PAGE_SIZE) {
        break;
      }

      page++;
    }

    return { issues: allIssues, totalFromApi };
  }
}
