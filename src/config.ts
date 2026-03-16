import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export interface SearchConfig {
  enabled: boolean;
  backend: 'vectra' | 'sqlite-vec';
  dir: string;
  modelName: string;
}

export interface MantisConfig {
  baseUrl: string;
  apiKey: string;
  cacheDir: string;
  cacheTtl: number;
  search: SearchConfig;
}

// ---------------------------------------------------------------------------
// .env.local loader
// ---------------------------------------------------------------------------

async function loadDotEnvLocal(): Promise<void> {
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
    const content = await readFile(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)/);
      if (match) {
        const key = match[1]!.trim();
        const value = match[2]!.trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch {
    // .env.local not present — use environment variables directly
  }
}

// ---------------------------------------------------------------------------
// mantis.json fallback shape (legacy bash-based setup)
// ---------------------------------------------------------------------------

interface MantisJsonFile {
  api_key?: string;
  base_url?: string;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

async function readMantisJson(): Promise<MantisJsonFile | null> {
  const filePath = join(homedir(), '.claude', 'mantis.json');
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as MantisJsonFile;
  } catch {
    return null;
  }
}

let cachedConfig: MantisConfig | null = null;

export async function getConfig(): Promise<MantisConfig> {
  if (cachedConfig) return cachedConfig;

  await loadDotEnvLocal();

  let baseUrl = process.env.MANTIS_BASE_URL ?? '';
  let apiKey = process.env.MANTIS_API_KEY ?? '';

  // If env vars are missing, try ~/.claude/mantis.json as fallback
  if (!baseUrl || !apiKey) {
    const json = await readMantisJson();
    if (json) {
      if (!baseUrl && json.base_url) baseUrl = json.base_url;
      if (!apiKey && json.api_key) apiKey = json.api_key;
    }
  }

  const missing: string[] = [];
  if (!baseUrl) missing.push('MANTIS_BASE_URL');
  if (!apiKey) missing.push('MANTIS_API_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required MantisBT configuration: ${missing.join(', ')}.\n` +
      `Set the environment variables or provide ~/.claude/mantis.json with keys "base_url" and "api_key".`
    );
  }

  const defaultCacheDir = join(homedir(), '.cache', 'mantisbt-mcp');
  const cacheDir = process.env.MANTIS_CACHE_DIR ?? defaultCacheDir;
  const cacheTtl = process.env.MANTIS_CACHE_TTL
    ? parseInt(process.env.MANTIS_CACHE_TTL, 10)
    : 3600;

  const searchEnabled = process.env.MANTIS_SEARCH_ENABLED === 'true';
  const searchBackendRaw = process.env.MANTIS_SEARCH_BACKEND ?? 'vectra';
  if (searchBackendRaw !== 'vectra' && searchBackendRaw !== 'sqlite-vec') {
    process.stderr.write(`[mantisbt-config] Unknown MANTIS_SEARCH_BACKEND="${searchBackendRaw}", falling back to "vectra"\n`);
  }
  const searchBackend: 'vectra' | 'sqlite-vec' =
    searchBackendRaw === 'sqlite-vec' ? 'sqlite-vec' : 'vectra';
  const searchDir = process.env.MANTIS_SEARCH_DIR ?? join(cacheDir, 'search');
  const searchModelName =
    process.env.MANTIS_SEARCH_MODEL ??
    'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

  cachedConfig = {
    baseUrl: baseUrl.replace(/\/$/, ''), // strip trailing slash
    apiKey,
    cacheDir,
    cacheTtl,
    search: {
      enabled: searchEnabled,
      backend: searchBackend,
      dir: searchDir,
      modelName: searchModelName,
    },
  };

  return cachedConfig;
}
