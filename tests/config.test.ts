import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — must be at module top level
vi.mock('node:fs/promises');

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TOOLSETS } from '../src/toolsets.js';
import { instanceDirName } from '../src/config.js';

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

async function freshGetStartupConfig(): Promise<(typeof import('../src/config.js'))['getStartupConfig']> {
  vi.resetModules();
  const mod = await import('../src/config.js');
  return mod.getStartupConfig;
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
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'env-api-key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://mantis.example.com');
    expect(config.apiKey).toBe('env-api-key');
  });

  it('strips trailing slash from baseUrl', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://mantis.example.com');
  });

  it('strips /api/rest suffix from baseUrl when user includes it', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://mantis.example.com');
  });

  it('strips /api/rest/ (with trailing slash) from baseUrl', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest/');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.baseUrl).toBe('https://mantis.example.com');
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

    expect(config.cacheDir).toBe(join('/custom/cache/dir', instanceDirName('https://mantis.example.com', 'key')));
  });

  it('enables index.php routing when MANTIS_USE_INDEX_PHP is true', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MANTIS_USE_INDEX_PHP', 'true');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.useIndexPhp).toBe(true);
  });

  it('disables index.php routing by default', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.useIndexPhp).toBe(false);
  });

  it('auto-detects index.php routing from an /api/rest/index.php base URL', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest/index.php');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.useIndexPhp).toBe(true);
    expect(config.baseUrl).toBe('https://mantis.example.com');
  });

  it('auto-detects index.php routing despite a trailing slash', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest/index.php/');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.useIndexPhp).toBe(true);
  });

  it('auto-detects index.php routing regardless of URL case', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/API/REST/Index.PHP');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.useIndexPhp).toBe(true);
    expect(config.baseUrl).toBe('https://mantis.example.com');
  });

  it('lets an explicit MANTIS_USE_INDEX_PHP=false override the auto-detected URL', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest/index.php');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MANTIS_USE_INDEX_PHP', 'false');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const getConfig = await freshGetConfig();
    const config = await getConfig();

    expect(config.useIndexPhp).toBe(false);
    stderr.mockRestore();
  });

  it('warns on stderr when the base URL contradicts an explicit MANTIS_USE_INDEX_PHP=false', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com/api/rest/index.php');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MANTIS_USE_INDEX_PHP', 'false');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const getConfig = await freshGetConfig();
    await getConfig();

    const written = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(written).toContain('MANTIS_USE_INDEX_PHP');
    stderr.mockRestore();
  });

  it('does not warn when base URL and explicit flag agree', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
    vi.stubEnv('MANTIS_USE_INDEX_PHP', 'false');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const getConfig = await freshGetConfig();
    await getConfig();

    const written = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(written).not.toContain('MANTIS_USE_INDEX_PHP');
    stderr.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// .env.local loading
// ---------------------------------------------------------------------------

describe('.env.local loading', () => {
  it('reads .env.local only once across getStartupConfig and getConfig', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');

    vi.resetModules();
    const mod = await import('../src/config.js');
    await mod.getStartupConfig();
    await mod.getConfig();

    expect(vi.mocked(readFile)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('getConfig() – errors', () => {
  it('throws when MANTIS_BASE_URL is not set', async () => {
    vi.stubEnv('MANTIS_API_KEY', 'some-key');

    const getConfig = await freshGetConfig();
    await expect(getConfig()).rejects.toThrow('MANTIS_BASE_URL');
  });

  it('throws when MANTIS_API_KEY is not set', async () => {
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');

    const getConfig = await freshGetConfig();
    await expect(getConfig()).rejects.toThrow('MANTIS_API_KEY');
  });

  it('throws when no configuration is provided at all', async () => {
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
// getStartupConfig — never throws without credentials
// ---------------------------------------------------------------------------

describe('getStartupConfig()', () => {
  it('succeeds without MANTIS_BASE_URL and MANTIS_API_KEY', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const getStartupConfig = await freshGetStartupConfig();
    const config = await getStartupConfig();

    expect(config).toBeDefined();
    expect(config.cacheTtl).toBe(3600);
    expect(config.httpHost).toBe('127.0.0.1');
    expect(config.httpPort).toBe(3000);
  });

  it('does not include baseUrl or apiKey', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const getStartupConfig = await freshGetStartupConfig();
    const config = await getStartupConfig();

    expect(config).not.toHaveProperty('baseUrl');
    expect(config).not.toHaveProperty('apiKey');
  });

  it('reads MANTIS_CACHE_DIR from environment', async () => {
    vi.stubEnv('MANTIS_CACHE_DIR', '/tmp/test-cache');
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const getStartupConfig = await freshGetStartupConfig();
    const config = await getStartupConfig();

    expect(config.cacheDir).toBe(join('/tmp/test-cache', 'unconfigured'));
  });

  // #8500
  it('enables every tool group and keeps destructive tools by default', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const config = await (await freshGetStartupConfig())();

    expect([...config.toolsets].sort()).toEqual([...TOOLSETS].sort());
    expect(config.disableDestructive).toBe(false);
  });

  it('reads MANTIS_TOOLSETS and MANTIS_DISABLE_DESTRUCTIVE', async () => {
    vi.stubEnv('MANTIS_TOOLSETS', 'issues, notes');
    vi.stubEnv('MANTIS_DISABLE_DESTRUCTIVE', 'true');
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const config = await (await freshGetStartupConfig())();

    expect(config.toolsets).toEqual(new Set(['issues', 'notes']));
    expect(config.disableDestructive).toBe(true);
  });

  it('rejects an unknown MANTIS_TOOLSETS group at startup', async () => {
    vi.stubEnv('MANTIS_TOOLSETS', 'issues,tickets');
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    await expect((await freshGetStartupConfig())()).rejects.toThrow(/Unknown MANTIS_TOOLSETS group "tickets"/);
  });

  // #8631: checked by the HTTP transport only, so stdio starts regardless.
  it('passes MCP_HTTP_MAX_BODY_SIZE on unchecked', async () => {
    vi.stubEnv('MCP_HTTP_MAX_BODY_SIZE', '64MB');
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    const config = await (await freshGetStartupConfig())();

    expect(config.httpMaxBodySize).toBe('64MB');
  });
});

// ---------------------------------------------------------------------------
// Cache and search directory per instance and account (#8625)
// ---------------------------------------------------------------------------

describe('instanceDirName()', () => {
  it('separates instances and accounts', () => {
    const base = instanceDirName('https://mantis.example.com', 'key-a');

    expect(instanceDirName('https://mantis.example.com', 'key-b')).not.toBe(base);
    expect(instanceDirName('https://other.example.com', 'key-a')).not.toBe(base);
    expect(base).toMatch(/^mantis\.example\.com-[0-9a-f]{16}$/); // no room for the key
  });

  it('maps the spellings of one base URL to the same folder', () => {
    const base = instanceDirName('https://mantis.example.com', 'key');

    expect(instanceDirName('https://mantis.example.com/', 'key')).toBe(base);
    expect(instanceDirName('https://mantis.example.com/api/rest/', 'key')).toBe(base);
    expect(instanceDirName('https://mantis.example.com/api/rest/index.php', 'key')).toBe(base);
  });

  it('uses a folder of its own without credentials', () => {
    expect(instanceDirName(undefined, undefined)).toBe('unconfigured');
    expect(instanceDirName('https://mantis.example.com', '')).toBe('unconfigured');
  });
});

describe('getStartupConfig() – directories per instance (#8625)', () => {
  beforeEach(() => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.stubEnv('MANTIS_BASE_URL', 'https://mantis.example.com');
    vi.stubEnv('MANTIS_API_KEY', 'key');
  });

  const instance = () => instanceDirName('https://mantis.example.com', 'key');

  it('puts metadata cache and search index into the instance folder', async () => {
    vi.stubEnv('MANTIS_CACHE_DIR', '/cache');

    const config = await (await freshGetStartupConfig())();

    expect(config.cacheDir).toBe(join('/cache', instance()));
    expect(config.search.dir).toBe(join('/cache', instance(), 'search'));
  });

  it('adds the instance folder to an explicit MANTIS_SEARCH_DIR', async () => {
    vi.stubEnv('MANTIS_SEARCH_DIR', '/index');

    const config = await (await freshGetStartupConfig())();

    expect(config.search.dir).toBe(join('/index', instance()));
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

// ---------------------------------------------------------------------------
// HTTP transport auth guard
// ---------------------------------------------------------------------------

describe('assertHttpAuthConfigured()', () => {
  it('throws when the token is undefined', async () => {
    const mod = await import('../src/config.js');
    expect(() => mod.assertHttpAuthConfigured(undefined)).toThrow(/MCP_HTTP_TOKEN/);
  });

  it('throws when the token is empty or whitespace', async () => {
    const mod = await import('../src/config.js');
    expect(() => mod.assertHttpAuthConfigured('')).toThrow(/MCP_HTTP_TOKEN/);
    expect(() => mod.assertHttpAuthConfigured('   ')).toThrow(/MCP_HTTP_TOKEN/);
  });

  it('accepts a non-empty token', async () => {
    const mod = await import('../src/config.js');
    expect(() => mod.assertHttpAuthConfigured('s3cret')).not.toThrow();
  });
});
