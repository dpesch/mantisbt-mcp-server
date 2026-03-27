import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBaseUrl } from './client.js';

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export interface SearchConfig {
  enabled: boolean;
  backend: 'vectra' | 'sqlite-vec';
  dir: string;
  modelName: string;
  numThreads: number;
}

export interface MantisConfig {
  baseUrl: string;
  apiKey: string;
  cacheDir: string;
  cacheTtl: number;
  uploadDir?: string;
  httpHost: string;
  httpPort: number;
  httpToken?: string;
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
// Non-credential config (safe to read at startup without credentials)
// ---------------------------------------------------------------------------

export type StartupConfig = Omit<MantisConfig, 'baseUrl' | 'apiKey'>;

function readNonCredentialConfig(): StartupConfig {
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
  const searchNumThreads = Math.max(1, parseInt(process.env.MANTIS_SEARCH_THREADS ?? '', 10) || 1);

  return {
    cacheDir,
    cacheTtl,
    uploadDir: process.env.MANTIS_UPLOAD_DIR,
    httpHost: process.env.MCP_HTTP_HOST ?? '127.0.0.1',
    httpPort: parseInt(process.env.PORT ?? '3000', 10),
    httpToken: process.env.MCP_HTTP_TOKEN,
    search: {
      enabled: searchEnabled,
      backend: searchBackend,
      dir: searchDir,
      modelName: searchModelName,
      numThreads: searchNumThreads,
    },
  };
}

/**
 * Returns all non-credential config values. Never throws, even when
 * MANTIS_BASE_URL / MANTIS_API_KEY are absent. Use this at server startup
 * so the MCP transport can connect and respond to tools/list without
 * requiring credentials to be configured.
 */
export async function getStartupConfig(): Promise<StartupConfig> {
  await loadDotEnvLocal();
  return readNonCredentialConfig();
}

// ---------------------------------------------------------------------------
// Full config (credentials required)
// ---------------------------------------------------------------------------

let cachedConfig: MantisConfig | null = null;

export async function getConfig(): Promise<MantisConfig> {
  if (cachedConfig) return cachedConfig;

  await loadDotEnvLocal();

  const baseUrl = process.env.MANTIS_BASE_URL ?? '';
  const apiKey = process.env.MANTIS_API_KEY ?? '';

  const missing: string[] = [];
  if (!baseUrl) missing.push('MANTIS_BASE_URL');
  if (!apiKey) missing.push('MANTIS_API_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required MantisBT configuration: ${missing.join(', ')}.\n` +
      `Set the environment variables MANTIS_BASE_URL and MANTIS_API_KEY.`
    );
  }

  cachedConfig = {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    ...readNonCredentialConfig(),
  };

  return cachedConfig;
}
