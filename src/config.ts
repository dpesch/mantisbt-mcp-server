import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBaseUrl, usesIndexPhpEntryPoint } from './client.js';

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

/**
 * Values that only exist once MantisBT credentials are configured. useIndexPhp
 * belongs here because it is partly derived from MANTIS_BASE_URL — it cannot be
 * answered before the base URL is known.
 */
export interface ConnectionConfig {
  baseUrl: string;
  apiKey: string;
  useIndexPhp: boolean;
}

/**
 * Values readable at server startup without any credentials, so the MCP
 * transport can connect and answer tools/list on an unconfigured install.
 */
export interface StartupConfig {
  cacheDir: string;
  cacheTtl: number;
  uploadDir?: string;
  httpHost: string;
  httpPort: number;
  httpToken?: string;
  search: SearchConfig;
  testEnvironment: boolean;
}

export type MantisConfig = ConnectionConfig & StartupConfig;

// ---------------------------------------------------------------------------
// .env.local loader
// ---------------------------------------------------------------------------

let cachedDotEnvLocal: Promise<void> | null = null;

/**
 * Loads .env.local at most once per process. Both getStartupConfig() and
 * getConfig() need it, and the HTTP transport calls them on separate paths —
 * without memoising, the file is read twice on every startup. Caching the
 * promise (not a boolean) also makes concurrent callers share one read.
 */
function loadDotEnvLocal(): Promise<void> {
  if (!cachedDotEnvLocal) cachedDotEnvLocal = readDotEnvLocal();
  return cachedDotEnvLocal;
}

async function readDotEnvLocal(): Promise<void> {
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
    testEnvironment: process.env.MCP_TEST_ENVIRONMENT === 'true',
  };
}

/**
 * Resolves index.php routing from MANTIS_USE_INDEX_PHP and the shape of
 * MANTIS_BASE_URL. An explicitly set env var always wins; the URL suffix is
 * only consulted when the user said nothing, so copying the full REST URL
 * from a MantisBT installation without URL rewriting just works. A base URL
 * that contradicts an explicit "false" is reported on stderr — silently
 * ignoring it would look like a broken server, not a misconfiguration.
 */
function resolveUseIndexPhp(rawBaseUrl: string): boolean {
  const explicit = process.env.MANTIS_USE_INDEX_PHP;
  const urlImpliesIndexPhp = usesIndexPhpEntryPoint(rawBaseUrl);

  if (explicit === undefined) return urlImpliesIndexPhp;

  const enabled = explicit === 'true';
  if (urlImpliesIndexPhp && !enabled) {
    process.stderr.write(
      `[mantisbt-config] MANTIS_BASE_URL ends with /api/rest/index.php, but MANTIS_USE_INDEX_PHP="${explicit}" — ` +
      `using plain /api/rest/ routing as configured. Unset MANTIS_USE_INDEX_PHP to route through index.php.\n`
    );
  }
  return enabled;
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

/**
 * Enforces authentication for the HTTP transport. Without a token, every tool
 * (including writes like create_issue, delete_issue and upload_file) would be
 * reachable unauthenticated by any process that can reach the port. Aborts
 * startup when the token is missing or blank so HTTP mode is never exposed open.
 */
export function assertHttpAuthConfigured(httpToken: string | undefined): void {
  if (httpToken === undefined || httpToken.trim() === '') {
    throw new Error(
      'HTTP transport requires authentication: set MCP_HTTP_TOKEN to a secret value.\n' +
      'Without it, all tools would be exposed unauthenticated. ' +
      'Use the stdio transport (the default) if you do not need HTTP.'
    );
  }
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
    useIndexPhp: resolveUseIndexPhp(baseUrl),
    ...readNonCredentialConfig(),
  };

  return cachedConfig;
}
