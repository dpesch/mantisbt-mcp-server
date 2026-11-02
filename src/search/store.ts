import { readFile, writeFile, rename, mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { LexicalIndex } from './lexical.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface VectorStoreItem {
  id: number;
  vector: number[];
  /** Vectors of further description chunks (#8541); the item scores by the best one. */
  chunks?: number[][];
  metadata: { summary: string; description?: string; updated_at?: string };
}

export interface VectorStore {
  add(item: VectorStoreItem): Promise<void>;
  addBatch(items: VectorStoreItem[]): Promise<void>;
  flush(): Promise<void>;
  /**
   * Best matches for the query vector. With the query text, the ranking fuses
   * vector and keyword (BM25) ranks; score stays the vector similarity.
   */
  search(vector: number[], topN: number, queryText?: string): Promise<Array<{ id: number; score: number }>>;
  getItem(id: number): Promise<VectorStoreItem | null>;
  delete(id: number): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
  getLastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(ts: string): Promise<void>;
  resetLastSyncedAt(): Promise<void>;
  getLastKnownTotal(): Promise<number | null>;
  setLastKnownTotal(total: number): Promise<void>;
  /** Embedder.signature the stored vectors were made with; null if unknown. */
  getEmbeddingSignature(): Promise<string | null>;
  setEmbeddingSignature(signature: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// VectraStore
// ---------------------------------------------------------------------------

// Reciprocal Rank Fusion constant. Measured on 7,739 issues (#8542): 10 keeps
// literal queries (titles, sentences, identifiers) at 97–100 % recall@10 and
// paraphrased ones level with vector-only search; the common 60 lost up to
// 8 points on literal queries.
const RRF_K = 10;

export class VectraStore implements VectorStore {
  private readonly vectraDir: string;
  private readonly lastSyncFile: string;
  private readonly lastTotalFile: string;
  private readonly signatureFile: string;
  private items: Map<number, VectorStoreItem> = new Map();
  private loaded = false;
  // Version of index.json the in-memory items correspond to (null: no file).
  // Every client session runs its own server process on the same index, so
  // another process may have rewritten the file since it was loaded.
  private loadedVersion: string | null = null;
  // Unflushed addBatch() changes — never discard them by reloading.
  private dirty = false;
  // Keyword index over the current items, built on the first search with
  // query text and dropped whenever the items change.
  private lexical: LexicalIndex | null = null;

  constructor(private readonly dir: string) {
    this.vectraDir = join(dir, 'vectra');
    this.lastSyncFile = join(dir, 'last_sync.txt');
    this.lastTotalFile = join(dir, 'last_total.txt');
    this.signatureFile = join(dir, 'embedding_signature.txt');
  }

  private get indexFile(): string {
    return join(this.vectraDir, 'index.json');
  }

  private async fileVersion(): Promise<string | null> {
    try {
      const { mtimeMs, size } = await stat(this.indexFile);
      return `${mtimeMs}:${size}`;
    } catch {
      return null;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded && this.dirty) return;
    const version = await this.fileVersion();
    if (this.loaded && version === this.loadedVersion) return;

    await mkdir(this.vectraDir, { recursive: true });
    try {
      const raw = await readFile(this.indexFile, 'utf-8');
      const parsed = JSON.parse(raw) as VectorStoreItem[];
      this.items = new Map(parsed.map(item => [item.id, item]));
    } catch {
      // No index yet — start empty
      this.items = new Map();
    }
    this.lexical = null;
    this.loaded = true;
    this.loadedVersion = version;
  }

  private async persist(): Promise<void> {
    const tmpFile = this.indexFile + '.tmp';
    const data = JSON.stringify([...this.items.values()]);
    await writeFile(tmpFile, data, 'utf-8');
    await rename(tmpFile, this.indexFile);
    this.loadedVersion = await this.fileVersion();
    this.dirty = false;
  }

  async add(item: VectorStoreItem): Promise<void> {
    await this.ensureLoaded();
    this.items.set(item.id, item);
    this.lexical = null;
    await this.persist();
  }

  async addBatch(items: VectorStoreItem[]): Promise<void> {
    await this.ensureLoaded();
    for (const item of items) {
      this.items.set(item.id, item);
    }
    this.lexical = null;
    this.dirty = items.length > 0 || this.dirty;
    // No persist() here — call flush() once after all batches are processed.
  }

  async flush(): Promise<void> {
    await this.persist();
  }

  async search(vector: number[], topN: number, queryText?: string): Promise<Array<{ id: number; score: number }>> {
    await this.ensureLoaded();
    const results: Array<{ id: number; score: number }> = [];

    for (const item of this.items.values()) {
      let score = cosineSimilarity(vector, item.vector);
      if (item.chunks) for (const chunk of item.chunks) score = Math.max(score, cosineSimilarity(vector, chunk));
      results.push({ id: item.id, score });
    }

    results.sort((a, b) => b.score - a.score);
    if (!queryText) return results.slice(0, topN);

    // Reciprocal Rank Fusion of the vector ranking and the keyword ranking.
    this.lexical ??= new LexicalIndex([...this.items.values()].map(item => ({ id: item.id, ...item.metadata })));
    const keywordRank = new Map(
      [...this.lexical.scores(queryText)].sort((a, b) => b[1] - a[1]).map(([id], rank) => [id, rank]),
    );
    const fused = results.map((result, vectorRank) => {
      const rank = keywordRank.get(result.id);
      return { result, fused: 1 / (RRF_K + vectorRank) + (rank === undefined ? 0 : 1 / (RRF_K + rank)) };
    });
    fused.sort((a, b) => b.fused - a.fused);
    return fused.slice(0, topN).map(f => f.result);
  }


  async getItem(id: number): Promise<VectorStoreItem | null> {
    await this.ensureLoaded();
    return this.items.get(id) ?? null;
  }

  async delete(id: number): Promise<void> {
    await this.ensureLoaded();
    this.items.delete(id);
    this.lexical = null;
    await this.persist();
  }

  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.items.size;
  }

  async clear(): Promise<void> {
    await this.ensureLoaded();
    this.items.clear();
    this.lexical = null;
    await this.persist();
  }

  async getLastSyncedAt(): Promise<string | null> {
    try {
      const content = await readFile(this.lastSyncFile, 'utf-8');
      return content.trim() || null;
    } catch {
      return null;
    }
  }

  async setLastSyncedAt(ts: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.lastSyncFile, ts, 'utf-8');
  }

  async resetLastSyncedAt(): Promise<void> {
    try {
      await unlink(this.lastSyncFile);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async getLastKnownTotal(): Promise<number | null> {
    try {
      const content = await readFile(this.lastTotalFile, 'utf-8');
      const parsed = parseInt(content.trim(), 10);
      return isNaN(parsed) ? null : parsed;
    } catch {
      return null;
    }
  }

  async setLastKnownTotal(total: number): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.lastTotalFile, String(total), 'utf-8');
  }

  async getEmbeddingSignature(): Promise<string | null> {
    try {
      return (await readFile(this.signatureFile, 'utf-8')).trim() || null;
    } catch {
      return null;
    }
  }

  async setEmbeddingSignature(signature: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.signatureFile, signature, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Cosine similarity helper
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createVectorStore(backend: 'vectra' | 'sqlite-vec', dir: string): VectorStore {
  if (backend === 'sqlite-vec') {
    throw new Error(
      'sqlite-vec backend requires manual installation: npm install sqlite-vec better-sqlite3'
    );
  }
  return new VectraStore(dir);
}
