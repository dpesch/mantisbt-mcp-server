import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../../src/client.js';
import { MetadataCache } from '../../src/cache.js';
import { registerConfigTools } from '../../src/tools/config.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const enumFixture = JSON.parse(
  readFileSync(join(fixturesDir, 'get_issue_enums.json'), 'utf-8')
) as { configs: Array<{ option: string; value: Array<{ id: number; name: string; label: string }> }> };

// Legacy: some MantisBT versions return value as a comma-separated "id:name" string
const ENUM_FIXTURE_STRING = {
  configs: [
    { option: 'severity_enum_string',        value: '10:feature,50:minor,80:block' },
    { option: 'status_enum_string',          value: '10:new,80:resolved,90:closed' },
    { option: 'priority_enum_string',        value: '10:none,30:normal,60:immediate' },
    { option: 'resolution_enum_string',      value: '10:open,20:fixed' },
    { option: 'reproducibility_enum_string', value: '10:always,70:have not tried' },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

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
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(enumFixture)));

    const result = await mockServer.callTool('get_issue_enums', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, Array<{ id: number; name: string }>>;

    expect(Array.isArray(parsed.severity)).toBe(true);
    expect(Array.isArray(parsed.status)).toBe(true);
    expect(Array.isArray(parsed.priority)).toBe(true);
    expect(Array.isArray(parsed.resolution)).toBe(true);
    expect(Array.isArray(parsed.reproducibility)).toBe(true);
  });

  it('parst Array-Format (MantisBT 2.x): id und name korrekt, label wird verworfen', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(enumFixture)));

    const result = await mockServer.callTool('get_issue_enums', {});

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, Array<{ id: number; name: string }>>;

    // Werte aus der echten Fixture prüfen
    expect(parsed.severity).toContainEqual({ id: 50, name: 'kleinerer Fehler' });
    expect(parsed.severity).toContainEqual({ id: 80, name: 'Blocker' });
    expect(parsed.severity).toContainEqual({ id: 200, name: 'Technische Schuld' });
    expect(parsed.status).toContainEqual({ id: 10, name: 'new' });
    expect(parsed.status).toContainEqual({ id: 80, name: 'resolved' });
    expect(parsed.priority).toContainEqual({ id: 30, name: 'normal' });
    expect(parsed.reproducibility).toContainEqual({ id: 70, name: 'have not tried' });
    // label darf nicht im Output enthalten sein
    expect(Object.keys(parsed.severity[0]!)).toEqual(['id', 'name']);
  });

  it('parst String-Format (Legacy): "id:name,..."-Strings korrekt', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE_STRING)));

    const result = await mockServer.callTool('get_issue_enums', {});

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, Array<{ id: number; name: string }>>;

    expect(parsed.severity).toContainEqual({ id: 50, name: 'minor' });
    expect(parsed.status).toContainEqual({ id: 80, name: 'resolved' });
    expect(parsed.reproducibility).toContainEqual({ id: 70, name: 'have not tried' });
  });

  it('fragt alle 5 Enum-Optionen ab', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(enumFixture)));

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
