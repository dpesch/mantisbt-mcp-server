import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — must be at module top level
vi.mock('node:fs/promises');

import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reset the module registry so that the `cachedConfig` singleton in config.ts
 * is re-initialized for each test. Then import getConfig fresh.
 */
async function freshGetConfig(): Promise<(typeof import('../src/config.js'))['getConfig']> {
  vi.resetModules();
  const mod = await import('../src/config.js');
  return mod.getConfig;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// ENV-based configuration
// ---------------------------------------------------------------------------

describe('getConfig() – ENV variables', () => {
  it('reads baseUrl and apiKey from environment variables', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest');
    vi.stubEnv('MANTIS_API_KEY', 'env-api-key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://mantis.example.com/api/rest');
    expect(config.apiKey).toBe('env-api-key');
  });

  it('strips trailing slash from baseUrl', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest/');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://mantis.example.com/api/rest');
  });

  it('parses MANTIS_CACHE_TTL as a number', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MANTIS_CACHE_TTL', '7200');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.cacheTtl).toBe(7200);
  });

  it('uses 3600 as default cacheTtl when MANTIS_CACHE_TTL is not set', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.cacheTtl).toBe(3600);
  });

  it('uses MANTIS_CACHE_DIR when provided', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MANTIS_CACHE_DIR', '/custom/cache/dir');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.cacheDir).toBe('/custom/cache/dir');
  });
});

// ---------------------------------------------------------------------------
// JSON fallback
// ---------------------------------------------------------------------------

describe('getConfig() – mantis.json fallback', () => {
  it('falls back to ~/.claude/mantis.json when ENV vars are missing', async () => {
    const json = JSON.stringify({ base_url: 'https://from-json.example.com', api_key: 'json-key' });
    vi.mocked(readFile).mockResolvedValue(json as any);

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://from-json.example.com');
    expect(config.apiKey).toBe('json-key');
  });

  it('prefers ENV vars over mantis.json values', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://from-env.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'env-key');
    const json = JSON.stringify({ base_url: 'https://from-json.example.com', api_key: 'json-key' });
    vi.mocked(readFile).mockResolvedValue(json as any);

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://from-env.example.com');
    expect(config.apiKey).toBe('env-key');
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('getConfig() – errors', () => {
  it('throws when neither ENV nor mantis.json provides baseUrl', async () => {
    vi.stubEnv('MANTIS_API_KEY', 'some-key');
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const getConfig = await freshGetConfig();
    await expect(getConfig()).rejects.toThrow('MANTIS_BASE_URL');
  });

  it('throws when neither ENV nor mantis.json provides apiKey', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const getConfig = await freshGetConfig();
    await expect(getConfig()).rejects.toThrow('MANTIS_API_KEY');
  });

  it('throws when no configuration is available at all', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const getConfig = await freshGetConfig();
    await expect(getConfig()).rejects.toThrow('Missing required MantisBT configuration');
  });
});

// ---------------------------------------------------------------------------
// HTTP transport configuration
// ---------------------------------------------------------------------------

describe('getConfig() – HTTP transport', () => {
  it('uses 127.0.0.1 as default httpHost', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.httpHost).toBe('127.0.0.1');
  });

  it('uses 3000 as default httpPort', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.httpPort).toBe(3000);
  });

  it('uses PORT when set', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('PORT', '8080');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.httpPort).toBe(8080);
  });

  it('uses MCP_HTTP_HOST when set', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MCP_HTTP_HOST', '0.0.0.0');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.httpHost).toBe('0.0.0.0');
  });

  it('leaves httpToken undefined when MCP_HTTP_TOKEN is not set', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.httpToken).toBeUndefined();
  });

  it('reads httpToken from MCP_HTTP_TOKEN', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MCP_HTTP_TOKEN', 'secret-token');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.httpToken).toBe('secret-token');
  });
});

// ---------------------------------------------------------------------------
// Singleton caching
// ---------------------------------------------------------------------------

describe('getConfig() – singleton', () => {
  it('returns the same object on repeated calls within the same module instance', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const first = await getConfig();
    const second = await getConfig();

    expect(first).toBe(second);
  });
});
