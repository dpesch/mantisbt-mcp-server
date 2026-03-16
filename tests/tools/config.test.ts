import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { MetadataCache } from '../../src/cache.js';
import { registerConfigTools } from '../../src/tools/config.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ENUM_FIXTURE = {
  configs: [
    { option: 'severity_enum_string',       value: '10:feature,20:trivial,30:text,40:tweak,50:minor,60:major,70:crash,80:block' },
    { option: 'status_enum_string',         value: '10:new,20:feedback,30:acknowledged,40:confirmed,50:assigned,80:resolved,90:closed' },
    { option: 'priority_enum_string',       value: '10:none,20:low,30:normal,40:high,50:urgent,60:immediate' },
    { option: 'resolution_enum_string',     value: '10:open,20:fixed,30:reopened,40:unable to duplicate,50:not fixable,60:duplicate,70:no change required,80:suspended,90:wont fix' },
    { option: 'reproducibility_enum_string', value: '10:always,30:sometimes,50:random,70:have not tried,90:unable to reproduce,100:N/A' },
  ],
};

let mockServer: MockMcpServer;
let client: MantisClient;
let cache: MetadataCache;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  cache = new MetadataCache('/tmp/cache-test', 86400);
  registerConfigTools(mockServer as never, client, cache);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// get_issue_enums
// ---------------------------------------------------------------------------

describe('get_issue_enums', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('get_issue_enums')).toBe(true);
  });

  it('gibt strukturierte Enum-Arrays für alle 5 Felder zurück', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    const result = await mockServer.callTool('get_issue_enums', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, Array<{ id: number; name: string }>>;

    expect(Array.isArray(parsed.severity)).toBe(true);
    expect(Array.isArray(parsed.status)).toBe(true);
    expect(Array.isArray(parsed.priority)).toBe(true);
    expect(Array.isArray(parsed.resolution)).toBe(true);
    expect(Array.isArray(parsed.reproducibility)).toBe(true);
  });

  it('parst id und name korrekt', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    const result = await mockServer.callTool('get_issue_enums', {});

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, Array<{ id: number; name: string }>>;

    expect(parsed.severity).toContainEqual({ id: 50, name: 'minor' });
    expect(parsed.severity).toContainEqual({ id: 80, name: 'block' });
    expect(parsed.status).toContainEqual({ id: 10, name: 'new' });
    expect(parsed.status).toContainEqual({ id: 80, name: 'resolved' });
    expect(parsed.priority).toContainEqual({ id: 30, name: 'normal' });
    expect(parsed.reproducibility).toContainEqual({ id: 70, name: 'have not tried' });
  });

  it('fragt alle 5 Enum-Optionen ab', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    await mockServer.callTool('get_issue_enums', {});

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('severity_enum_string');
    expect(calledUrl).toContain('status_enum_string');
    expect(calledUrl).toContain('priority_enum_string');
    expect(calledUrl).toContain('resolution_enum_string');
    expect(calledUrl).toContain('reproducibility_enum_string');
  });

  it('gibt isError: true bei API-Fehler zurück', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(403, JSON.stringify({ message: 'Access denied' })));

    const result = await mockServer.callTool('get_issue_enums', {});

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});
