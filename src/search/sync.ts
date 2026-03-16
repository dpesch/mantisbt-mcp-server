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

export class SearchSyncService {
  constructor(
    private readonly client: MantisClient,
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
  ) {}

  async sync(projectId?: number): Promise<{ indexed: number; skipped: number }> {
    const lastSyncedAt = await this.store.getLastSyncedAt();

    const allIssues = await this.fetchAllIssues(lastSyncedAt ?? undefined, projectId);

    let indexed = 0;
    let skipped = 0;

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
    }

    await this.store.setLastSyncedAt(new Date().toISOString());
    return { indexed, skipped };
  }

  private async fetchAllIssues(
    updatedAfter: string | undefined,
    projectId: number | undefined,
  ): Promise<IssueListItem[]> {
    const allIssues: IssueListItem[] = [];
    let page = 1;
    let total: number | null = null;

    do {
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
      allIssues.push(...response.issues);

      if (total === null) {
        total = response.total_count;
        if (total === null || total === undefined) {
          throw new Error('MantisBT API response missing total_count field');
        }
      }

      page++;
    } while (allIssues.length < total);

    return allIssues;
  }
}
