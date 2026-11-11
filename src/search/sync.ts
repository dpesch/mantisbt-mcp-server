import type { MantisClient } from '../client.js';
import type { VectorStore, VectorStoreItem } from './store.js';
import type { Embedder, EmbeddingDocument } from './embedder.js';
import { acquireSyncLock } from './sync-lock.js';

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

// Listing of the issue IDs the account can see (#8626), with select=id. It
// ends at an empty page, not at a short one: a server that caps page_size
// would otherwise end it after the first page and empty the index. Past
// MAX_ID_PAGES it counts as incomplete, and nothing is removed.
const ID_PAGE_SIZE = 1000;
const MAX_ID_PAGES = 200;

type SyncResult = { indexed: number; skipped: number; removed: number; total: number | null };

export class SyncLockedError extends Error {
  constructor() {
    super('A search index sync is already running — try again once it has finished');
    this.name = 'SyncLockedError';
  }
}

export class SearchSyncService {
  constructor(
    private readonly client: MantisClient,
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
    private readonly lockDir?: string,
  ) {}

  /**
   * Indexes all issues changed since the last sync. With `full`, the index is
   * cleared first — inside the lock, so a running sync of another process is
   * never wiped underneath it.
   */
  async sync(projectId?: number, { full = false }: { full?: boolean } = {}): Promise<SyncResult> {
    if (this.lockDir === undefined) return this.syncUnlocked(projectId, full);

    const release = await acquireSyncLock(this.lockDir);
    if (!release) throw new SyncLockedError();
    try {
      return await this.syncUnlocked(projectId, full);
    } finally {
      await release();
    }
  }

  private async syncUnlocked(projectId: number | undefined, full: boolean): Promise<SyncResult> {
    // Vectors made with another model or token limit are not comparable with
    // new query vectors, and an incremental sync never replaces them — their
    // issues are unchanged. Such an index is rebuilt, for all projects, since
    // it is useless as it stands. An empty index only takes the signature.
    const signature = this.embedder.signature;
    const mismatch = (await this.store.getEmbeddingSignature()) !== signature;
    const outdated = mismatch && (await this.store.count()) > 0;
    const scope = outdated ? undefined : projectId;

    if (full || outdated) {
      await this.store.clear();
      await this.store.resetLastSyncedAt();
    }
    // Stored before indexing: an interrupted rebuild then resumes on the next
    // sync instead of starting over.
    if (full || mismatch) await this.store.setEmbeddingSignature(signature);

    const lastSyncedAt = await this.store.getLastSyncedAt();

    const { issues: allIssues, totalFromApi } = await this.fetchAllIssues(lastSyncedAt ?? undefined, scope);

    let indexed = 0;
    let skipped = 0;
    let indexedSinceCheckpoint = 0;

    // Process in batches of EMBED_BATCH_SIZE
    for (let i = 0; i < allIssues.length; i += EMBED_BATCH_SIZE) {
      const batch = allIssues.slice(i, i + EMBED_BATCH_SIZE);
      const toEmbed: Array<{ issue: IssueListItem; doc: EmbeddingDocument }> = [];

      for (const issue of batch) {
        if (!issue.summary) {
          skipped++;
          continue;
        }
        if (issue.updated_at && (await this.store.getItem(issue.id))?.metadata.updated_at === issue.updated_at) {
          continue; // already indexed in this exact version
        }
        toEmbed.push({ issue, doc: { summary: issue.summary, description: issue.description } });
      }

      if (toEmbed.length === 0) continue;

      const vectors = await this.embedder.embedDocuments(toEmbed.map(e => e.doc));

      const batchItems: VectorStoreItem[] = toEmbed.map(({ issue, doc }, j) => {
        const [vector, ...chunks] = vectors[j]!;
        return {
          id: issue.id,
          vector: vector!,
          ...(chunks.length > 0 && { chunks }),
          metadata: { ...doc, updated_at: issue.updated_at },
        };
      });
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

    // Issues deleted in MantisBT, or no longer visible to this account, never
    // show up as changed (#8626). A sync over all projects therefore drops
    // every indexed issue the account cannot see any more. A project-scoped
    // sync sees only part of the issues, and a cleared index holds no stale
    // ones — both skip the listing.
    let removed = 0;
    if (scope === undefined && !full && !outdated) {
      const visible = await this.fetchVisibleIds();
      const stale = visible ? (await this.store.ids()).filter(id => !visible.has(id)) : [];
      if (stale.length > 0) {
        await this.store.delete(...stale); // also writes the items added above
        removed = stale.length;
      }
    }

    // Final flush for any remaining items not yet written by a checkpoint.
    if (indexedSinceCheckpoint > 0 && removed === 0) {
      await this.store.flush();
    }

    // The watermark is the newest updated_at the server reported, not the local
    // clock: a client clock running ahead of the server would otherwise skip
    // changes for good. A project-scoped sync must not move the shared watermark,
    // since changes in the other projects were not looked at.
    const newestUpdatedAt = allIssues.find(issue => issue.updated_at)?.updated_at;
    if (scope === undefined && newestUpdatedAt && newestUpdatedAt !== lastSyncedAt) {
      await this.store.setLastSyncedAt(newestUpdatedAt);
    }

    // Persist the best known total for get_search_index_status.
    // Priority: API total_count > full-rebuild count > current store size.
    // The store size fallback handles MantisBT installations that never return
    // total_count and ensures the status tool never shows "total unknown" after
    // any sync has completed.
    const storeCount = await this.store.count();
    const total = totalFromApi ?? (lastSyncedAt === null ? allIssues.length : storeCount);
    await this.store.setLastKnownTotal(total);

    return { indexed, skipped, removed, total };
  }

  /** IDs of all issues the account can see; null if the listing did not end. */
  private async fetchVisibleIds(): Promise<Set<number> | null> {
    const ids = new Set<number>();
    for (let page = 1; page <= MAX_ID_PAGES; page++) {
      const response = await this.client.get<IssueListResponse>('issues', { page_size: ID_PAGE_SIZE, page, select: 'id' });
      const issues = response.issues ?? [];
      if (issues.length === 0) return ids;
      for (const { id } of issues) ids.add(id);
    }
    return null;
  }

  private async fetchAllIssues(
    updatedAfter: string | undefined,
    projectId: number | undefined,
  ): Promise<{ issues: IssueListItem[]; totalFromApi: number | null }> {
    const changedIssues: IssueListItem[] = [];
    const updatedAfterMs = updatedAfter ? new Date(updatedAfter).getTime() : undefined;
    let fetchedCount = 0;
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
      fetchedCount += pageIssues.length;

      // The MantisBT REST API ignores updated_after, sort and direction (they are
      // still sent for API versions that honour them). It always returns issues
      // ordered by last_updated DESC without pulling sticky issues to the top
      // (see filter_get_default() and mc_filter_get_issues()), so the first issue
      // older than the watermark marks the end of the changes. Ties are kept:
      // timestamps have one-second resolution, and sync() skips issues whose
      // indexed version is already current.
      const cut = updatedAfterMs === undefined
        ? -1
        : pageIssues.findIndex(issue => issue.updated_at && new Date(issue.updated_at).getTime() < updatedAfterMs);
      const reachedWatermark = cut !== -1;
      changedIssues.push(...(reachedWatermark ? pageIssues.slice(0, cut) : pageIssues));

      // Capture total_count from the first page that provides it
      if (totalFromApi === null && response.total_count != null) {
        totalFromApi = response.total_count;
      }

      // Stop when we have fetched all changed issues:
      // - the watermark was reached on this page, or
      // - total_count is provided and reached, or
      // - page returned fewer items than requested (last page)
      if (reachedWatermark) break;
      if (totalFromApi !== null) {
        if (fetchedCount >= totalFromApi) break;
      } else if (pageIssues.length < PAGE_SIZE) {
        break;
      }

      page++;
    }

    return { issues: changedIssues, totalFromApi };
  }
}
