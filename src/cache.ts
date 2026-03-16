import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MantisProject, MantisUser, MantisVersion, MantisCategory, MantisTag } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedProjectMeta {
  users: MantisUser[];
  versions: MantisVersion[];
  categories: MantisCategory[];
}

export interface CachedMetadata {
  timestamp: number;
  projects: MantisProject[];
  byProject: Record<number, CachedProjectMeta>;
  tags: MantisTag[];
}

interface CacheFile {
  timestamp: number;
  data: CachedMetadata;
}

// ---------------------------------------------------------------------------
// MetadataCache
// ---------------------------------------------------------------------------

export class MetadataCache {
  private readonly filePath: string;
  private readonly issueFieldsFilePath: string;
  private readonly ttlSeconds: number;
  private readonly cacheDir: string;

  constructor(cacheDir: string, ttlSeconds: number) {
    this.cacheDir = cacheDir;
    this.filePath = join(cacheDir, 'metadata.json');
    this.issueFieldsFilePath = join(cacheDir, 'issue_fields.json');
    this.ttlSeconds = ttlSeconds;
  }

  async isValid(): Promise<boolean> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const file = JSON.parse(raw) as CacheFile;
      const ageSeconds = (Date.now() - file.timestamp) / 1000;
      return ageSeconds < this.ttlSeconds;
    } catch {
      return false;
    }
  }

  async load(): Promise<CachedMetadata | null> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const file = JSON.parse(raw) as CacheFile;
      return file.data;
    } catch {
      return null;
    }
  }

  async loadIfValid(): Promise<CachedMetadata | null> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const file = JSON.parse(raw) as CacheFile;
      const ageSeconds = (Date.now() - file.timestamp) / 1000;
      if (ageSeconds >= this.ttlSeconds) return null;
      return file.data;
    } catch {
      return null;
    }
  }

  async save(data: CachedMetadata): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const file: CacheFile = {
      timestamp: Date.now(),
      data,
    };
    await writeFile(this.filePath, JSON.stringify(file, null, 2), 'utf-8');
  }

  async invalidate(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch {
      // Already gone — that is fine
    }
  }

  async loadIssueFields(): Promise<string[] | null> {
    try {
      const raw = await readFile(this.issueFieldsFilePath, 'utf-8');
      const file = JSON.parse(raw) as { timestamp: number; fields: string[] };
      const ageSeconds = (Date.now() - file.timestamp) / 1000;
      if (ageSeconds >= this.ttlSeconds) return null;
      return file.fields;
    } catch {
      return null;
    }
  }

  async saveIssueFields(fields: string[]): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const file = { timestamp: Date.now(), fields };
    await writeFile(this.issueFieldsFilePath, JSON.stringify(file, null, 2), 'utf-8');
  }
}
