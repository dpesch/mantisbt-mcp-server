import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../../src/client.js';
import { registerUserTools } from '../../src/tools/users.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Fixtures laden (mit Inline-Fallback)
// ---------------------------------------------------------------------------

const getCurrentUserFixturePath = join(fixturesDir, 'get_current_user.json');

const getCurrentUserFixture = existsSync(getCurrentUserFixturePath)
  ? (JSON.parse(readFileSync(getCurrentUserFixturePath, 'utf-8')) as { id: number; name: string; real_name?: string; email?: string })
  : { id: 5, name: 'testuser', real_name: 'Test User', email: 'test@example.com' };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  registerUserTools(mockServer as never, client);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// get_current_user
// ---------------------------------------------------------------------------

describe('get_current_user', () => {
  it('ist registriert', () => {
    expect(mockServer.hasToolRegistered('get_current_user')).toBe(true);
  });

  it('gibt User-Daten zurück mit id und name', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(getCurrentUserFixture)));

    const result = await mockServer.callTool('get_current_user', {});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { id: number; name: string };
    expect(typeof parsed.id).toBe('number');
    expect(typeof parsed.name).toBe('string');
    expect(parsed.id).toBe(getCurrentUserFixture.id);
    expect(parsed.name).toBe(getCurrentUserFixture.name);
  });
});
