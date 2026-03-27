import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { MetadataCache } from '../../src/cache.js';
import { registerResources } from '../../src/resources/index.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

// ---------------------------------------------------------------------------
// Inline fixtures
// ---------------------------------------------------------------------------

const USER_FIXTURE = { id: 1, name: 'jsmith', real_name: 'John Smith', email: 'jsmith@example.com' };

const PROJECTS_FIXTURE = [
  { id: 10, name: 'Alpha', enabled: true },
  { id: 11, name: 'Beta',  enabled: true },
];

// Simulates a raw MantisBT API response with extra fields that must be stripped
const PROJECTS_RAW_FIXTURE = [
  {
    id: 10,
    name: 'Alpha',
    enabled: true,
    status: { id: 10, name: 'development', label: 'Entwicklung' },
    view_state: { id: 10, name: 'public', label: 'Öffentlich' },
    custom_fields: [
      { id: 1, name: 'Reklamieren', type: 'checkbox', default_value: '', possible_values: 'Ja' },
    ],
  },
];

const ENUM_FIXTURE = {
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
  cache = new MetadataCache('/tmp/cache-resources-test', 86400);
  registerResources(mockServer as never, client, cache);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cache.invalidate();
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('resource registration', () => {
  it('registers mantis://me', () => {
    expect(mockServer.hasResourceRegistered('mantis://me')).toBe(true);
  });

  it('registers mantis://projects', () => {
    expect(mockServer.hasResourceRegistered('mantis://projects')).toBe(true);
  });

  it('registers mantis://enums', () => {
    expect(mockServer.hasResourceRegistered('mantis://enums')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mantis://me
// ---------------------------------------------------------------------------

describe('mantis://me', () => {
  it('returns a single content item with application/json', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(USER_FIXTURE)));

    const result = await mockServer.callResource('mantis://me');

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.mimeType).toBe('application/json');
  });

  it('sets uri to mantis://me', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(USER_FIXTURE)));

    const result = await mockServer.callResource('mantis://me');

    expect(result.contents[0]!.uri).toBe('mantis://me');
  });

  it('returns valid JSON with id and name', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(USER_FIXTURE)));

    const result = await mockServer.callResource('mantis://me');

    const parsed = JSON.parse(result.contents[0]!.text) as { id: number; name: string };
    expect(parsed.id).toBe(USER_FIXTURE.id);
    expect(parsed.name).toBe(USER_FIXTURE.name);
  });
});

// ---------------------------------------------------------------------------
// mantis://projects
// ---------------------------------------------------------------------------

describe('mantis://projects', () => {
  it('returns a single content item with application/json', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: PROJECTS_FIXTURE })));

    const result = await mockServer.callResource('mantis://projects');

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.mimeType).toBe('application/json');
  });

  it('sets uri to mantis://projects', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: PROJECTS_FIXTURE })));

    const result = await mockServer.callResource('mantis://projects');

    expect(result.contents[0]!.uri).toBe('mantis://projects');
  });

  it('returns a JSON array of projects from live API when cache is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: PROJECTS_FIXTURE })));

    const result = await mockServer.callResource('mantis://projects');

    const parsed = JSON.parse(result.contents[0]!.text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('returns minified JSON (no indentation)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: PROJECTS_FIXTURE })));

    const result = await mockServer.callResource('mantis://projects');

    expect(result.contents[0]!.text).not.toContain('\n');
  });

  it('strips custom_fields from live API response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: PROJECTS_RAW_FIXTURE })));

    const result = await mockServer.callResource('mantis://projects');

    const parsed = JSON.parse(result.contents[0]!.text) as Array<Record<string, unknown>>;
    expect(parsed[0]).not.toHaveProperty('custom_fields');
  });

  it('preserves label on status and view_state from live API response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: PROJECTS_RAW_FIXTURE })));

    const result = await mockServer.callResource('mantis://projects');

    const parsed = JSON.parse(result.contents[0]!.text) as Array<Record<string, unknown>>;
    expect((parsed[0]!['status'] as Record<string, unknown>)['label']).toBe('Entwicklung');
    expect((parsed[0]!['view_state'] as Record<string, unknown>)['label']).toBe('Öffentlich');
  });

  it('serves from cache without calling the API when cache is valid', async () => {
    await cache.save({
      timestamp: Date.now(),
      projects: PROJECTS_FIXTURE,
      byProject: {},
      tags: [],
    });

    const result = await mockServer.callResource('mantis://projects');

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.contents[0]!.text) as unknown[];
    expect(parsed).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// mantis://enums
// ---------------------------------------------------------------------------

describe('mantis://enums', () => {
  it('returns a single content item with application/json', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    const result = await mockServer.callResource('mantis://enums');

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.mimeType).toBe('application/json');
  });

  it('sets uri to mantis://enums', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    const result = await mockServer.callResource('mantis://enums');

    expect(result.contents[0]!.uri).toBe('mantis://enums');
  });

  it('returns parsed enum groups with id and name entries', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    const result = await mockServer.callResource('mantis://enums');

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, Array<{ id: number; name: string }>>;
    for (const key of ['severity', 'priority', 'status', 'resolution', 'reproducibility']) {
      expect(Array.isArray(parsed[key])).toBe(true);
      expect(parsed[key]!.length).toBeGreaterThan(0);
      expect(parsed[key]![0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
    }
  });

  it('parses severity values correctly from fixture', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    const result = await mockServer.callResource('mantis://enums');

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, Array<{ id: number; name: string }>>;
    expect(parsed['severity']).toContainEqual({ id: 10, name: 'feature' });
    expect(parsed['severity']).toContainEqual({ id: 50, name: 'minor' });
  });
});
