import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { VersionHintService } from '../../src/version-hint.js';
import { registerVersionTools } from '../../src/tools/version.js';
import { MockMcpServer } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// get_version (#8498) — replaces get_mcp_version and get_mantis_version
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let versionHint: VersionHintService;

beforeEach(() => {
  mockServer = new MockMcpServer();
  versionHint = new VersionHintService();
  registerVersionTools(mockServer as never, new MantisClient('https://mantis.example.com', 'test-token'), versionHint, '1.15.0-test');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'X-Mantis-Version': '2.28.4' } })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('get_version', () => {
  it('returns MCP server and MantisBT version without GitHub check when check_latest is false', async () => {
    const trigger = vi.spyOn(versionHint, 'triggerLatestVersionFetch');

    const result = await mockServer.callTool('get_version', { check_latest: false }, { validate: true });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      mcp_server: { version: '1.15.0-test' },
      mantis: { installed_version: '2.28.4' },
    });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('compares the MantisBT version with the latest release by default', async () => {
    vi.spyOn(versionHint, 'triggerLatestVersionFetch').mockImplementation(() => {});
    vi.spyOn(versionHint, 'waitForLatestVersion').mockResolvedValue('2.28.4');

    const result = await mockServer.callTool('get_version', {}, { validate: true });

    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      mcp_server: { version: '1.15.0-test' },
      mantis: { installed_version: '2.28.4', latest_version: '2.28.4', status: 'up-to-date' },
    });
  });

  it('still reports the MCP server version when MantisBT is unreachable', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }));

    const result = await mockServer.callTool('get_version', { check_latest: false }, { validate: true });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { mcp_server: { version: string }; mantis: { error: string } };
    expect(parsed.mcp_server.version).toBe('1.15.0-test');
    expect(parsed.mantis.error).toContain('503');
  });
});
