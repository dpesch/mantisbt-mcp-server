import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type EnumResult = Record<string, Array<{ id: number; name: string; label?: string }>>;
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

  describe('mit Array-Format (MantisBT 2.x)', () => {
    let parsed: EnumResult;

    beforeEach(async () => {
      vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(enumFixture)));
      const result = await mockServer.callTool('get_issue_enums', {});
      parsed = JSON.parse(result.content[0]!.text) as EnumResult;
    });

    it('gibt strukturierte Enum-Arrays für alle 5 Felder zurück', () => {
      expect(Array.isArray(parsed.severity)).toBe(true);
      expect(Array.isArray(parsed.status)).toBe(true);
      expect(Array.isArray(parsed.priority)).toBe(true);
      expect(Array.isArray(parsed.resolution)).toBe(true);
      expect(Array.isArray(parsed.reproducibility)).toBe(true);
    });

    it('id und name korrekt für alle Felder', () => {
      expect(parsed.severity).toContainEqual(expect.objectContaining({ id: 50, name: 'kleinerer Fehler' }));
      expect(parsed.severity).toContainEqual(expect.objectContaining({ id: 80, name: 'Blocker' }));
      expect(parsed.severity).toContainEqual(expect.objectContaining({ id: 200, name: 'Technische Schuld' }));
      expect(parsed.status).toContainEqual(expect.objectContaining({ id: 10, name: 'new' }));
      expect(parsed.status).toContainEqual(expect.objectContaining({ id: 80, name: 'resolved' }));
      expect(parsed.priority).toContainEqual(expect.objectContaining({ id: 30, name: 'normal' }));
      expect(parsed.reproducibility).toContainEqual(expect.objectContaining({ id: 70, name: 'have not tried' }));
    });

    it('label wird ausgegeben wenn er sich von name unterscheidet (lokalisierte Installation)', () => {
      // status: name="new", label="neu" → label muss im Output enthalten sein
      expect(parsed.status).toContainEqual({ id: 10, name: 'new', label: 'neu' });
      expect(parsed.status).toContainEqual({ id: 80, name: 'resolved', label: 'erledigt' });
      // priority: name="none", label="keine" → label muss im Output enthalten sein
      expect(parsed.priority).toContainEqual({ id: 10, name: 'none', label: 'keine' });
      // reproducibility: name="always", label="immer" → label muss im Output enthalten sein
      expect(parsed.reproducibility).toContainEqual({ id: 10, name: 'always', label: 'immer' });
    });

    it('label wird weggelassen wenn er identisch mit name ist', () => {
      // severity: name === label (z.B. "Feature-Wunsch" === "Feature-Wunsch") → kein label-Feld
      const severityFirst = parsed.severity.find(e => e.id === 10)!;
      expect(severityFirst).toEqual({ id: 10, name: 'Feature-Wunsch' });
      expect(severityFirst).not.toHaveProperty('label');

      // priority: name="normal", label="normal" → kein label-Feld
      const priorityNormal = parsed.priority.find(e => e.id === 30)!;
      expect(priorityNormal).toEqual({ id: 30, name: 'normal' });
      expect(priorityNormal).not.toHaveProperty('label');
    });

    it('fragt alle 5 Enum-Optionen ab', () => {
      const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('severity_enum_string');
      expect(calledUrl).toContain('status_enum_string');
      expect(calledUrl).toContain('priority_enum_string');
      expect(calledUrl).toContain('resolution_enum_string');
      expect(calledUrl).toContain('reproducibility_enum_string');
    });
  });

  it('parst String-Format (Legacy): "id:name,..."-Strings korrekt', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE_STRING)));

    const result = await mockServer.callTool('get_issue_enums', {});

    const parsed = JSON.parse(result.content[0]!.text) as EnumResult;

    expect(parsed.severity).toContainEqual({ id: 50, name: 'minor' });
    expect(parsed.status).toContainEqual({ id: 80, name: 'resolved' });
    expect(parsed.reproducibility).toContainEqual({ id: 70, name: 'have not tried' });
  });

  it('gibt isError: true bei API-Fehler zurück', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(403, JSON.stringify({ message: 'Access denied' })));

    const result = await mockServer.callTool('get_issue_enums', {});

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});
