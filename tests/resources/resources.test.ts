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

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('returns a JSON array of projects', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ projects: PROJECTS_FIXTURE })));

    const result = await mockServer.callResource('mantis://projects');

    const parsed = JSON.parse(result.contents[0]!.text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
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

  it('returns parsed enum groups for severity, priority, status, resolution, reproducibility', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(ENUM_FIXTURE)));

    const result = await mockServer.callResource('mantis://enums');

    const parsed = JSON.parse(result.contents[0]!.text) as Record<string, unknown[]>;
    expect(Array.isArray(parsed['severity'])).toBe(true);
    expect(Array.isArray(parsed['priority'])).toBe(true);
    expect(Array.isArray(parsed['status'])).toBe(true);
    expect(Array.isArray(parsed['resolution'])).toBe(true);
    expect(Array.isArray(parsed['reproducibility'])).toBe(true);
  });
});
