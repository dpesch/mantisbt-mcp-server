import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface VectorStoreItem {
  id: number;
  vector: number[];
  metadata: { summary: string; description?: string; updated_at?: string };
}

export interface VectorStore {
  add(item: VectorStoreItem): Promise<void>;
  addBatch(items: VectorStoreItem[]): Promise<void>;
  search(vector: number[], topN: number): Promise<Array<{ id: number; score: number }>>;
  delete(id: number): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
  getLastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(ts: string): Promise<void>;
  resetLastSyncedAt(): Promise<void>;
}

// ---------------------------------------------------------------------------
// VectraStore
// ---------------------------------------------------------------------------

export class VectraStore implements VectorStore {
  private readonly vectraDir: string;
  private readonly lastSyncFile: string;
  private items: Map<number, VectorStoreItem> = new Map();
  private loaded = false;

  constructor(private readonly dir: string) {
    this.vectraDir = join(dir, 'vectra');
    this.lastSyncFile = join(dir, 'last_sync.txt');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await mkdir(this.vectraDir, { recursive: true });
    const indexFile = join(this.vectraDir, 'index.json');
    try {
      const raw = await readFile(indexFile, 'utf-8');
      const parsed = JSON.parse(raw) as VectorStoreItem[];
      this.items = new Map(parsed.map(item => [item.id, item]));
    } catch {
      // No index yet — start empty
      this.items = new Map();
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const indexFile = join(this.vectraDir, 'index.json');
    const data = JSON.stringify([...this.items.values()]);
    await writeFile(indexFile, data, 'utf-8');
  }

  async add(item: VectorStoreItem): Promise<void> {
    await this.ensureLoaded();
    this.items.set(item.id, item);
    await this.persist();
  }

  async addBatch(items: VectorStoreItem[]): Promise<void> {
    await this.ensureLoaded();
    for (const item of items) {
      this.items.set(item.id, item);
    }
    await this.persist();
  }

  async search(vector: number[], topN: number): Promise<Array<{ id: number; score: number }>> {
    await this.ensureLoaded();
    const results: Array<{ id: number; score: number }> = [];

    for (const item of this.items.values()) {
      const score = cosineSimilarity(vector, item.vector);
      results.push({ id: item.id, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  }

  async delete(id: number): Promise<void> {
    await this.ensureLoaded();
    this.items.delete(id);
    await this.persist();
  }

  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.items.size;
  }

  async clear(): Promise<void> {
    await this.ensureLoaded();
    this.items.clear();
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
