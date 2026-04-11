import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MantisClient, MantisApiError, buildIssueViewUrl, buildNoteViewUrl } from '../src/client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    text: () => Promise.resolve(body),
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

describe('MantisClient – URL building', () => {
  it('appends /api/rest/<path> to the base URL', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token123');
    return client.get('issues/42').then(() => {
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://mantis.example.com/api/rest/issues/42');
    });
  });

  it('strips trailing slash from base URL', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com/', 'token123');
    return client.get('issues').then(() => {
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://mantis.example.com/api/rest/issues');
    });
  });

  it('strips /api/rest suffix when user includes it in the base URL', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com/api/rest', 'token123');
    return client.get('issues/42').then(() => {
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://mantis.example.com/api/rest/issues/42');
    });
  });

  it('strips /api/rest/ (with trailing slash) from base URL', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com/api/rest/', 'token123');
    return client.get('issues/42').then(() => {
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://mantis.example.com/api/rest/issues/42');
    });
  });

  it('appends defined query parameters', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token123');
    return client.get('issues', { page_size: 10, page: 1 }).then(() => {
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('page_size')).toBe('10');
      expect(url.searchParams.get('page')).toBe('1');
    });
  });

  it('omits undefined query parameters', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token123');
    return client.get('issues', { page_size: 10, filter_id: undefined }).then(() => {
      const calledUrl: string = fetchMock.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.has('filter_id')).toBe(false);
      expect(url.searchParams.get('page_size')).toBe('10');
    });
  });
});

// ---------------------------------------------------------------------------
// Request headers
// ---------------------------------------------------------------------------

describe('MantisClient – request headers', () => {
  it('sends Authorization and Content-Type headers', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'myApiKey');
    return client.get('issues').then(() => {
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('myApiKey');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});

// ---------------------------------------------------------------------------
// handleResponse
// ---------------------------------------------------------------------------

describe('MantisClient – handleResponse', () => {
  it('returns parsed JSON on 200', () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, JSON.stringify({ id: 42 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    return client.get<{ id: number }>('issues/42').then((result) => {
      expect(result).toEqual({ id: 42 });
    });
  });

  it('returns undefined on 204 No Content', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204, ''));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    return client.delete('issues/42').then((result) => {
      expect(result).toBeUndefined();
    });
  });

  it('throws MantisApiError with statusCode on 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(404, JSON.stringify({ message: 'Issue not found' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    await expect(client.get('issues/9999')).rejects.toMatchObject({
      statusCode: 404,
      name: 'MantisApiError',
    });
  });

  it('uses raw body as message when JSON has no message field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(403, JSON.stringify({ detail: 'forbidden' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    // When body is JSON but has no `message` key, the raw body string is used
    await expect(client.get('issues')).rejects.toThrow('{"detail":"forbidden"}');
  });

  it('MantisApiError is instanceof Error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(401, JSON.stringify({ message: 'Unauthorized' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    await expect(client.get('issues')).rejects.toBeInstanceOf(MantisApiError);
  });
});

// ---------------------------------------------------------------------------
// HTTP methods
// ---------------------------------------------------------------------------

describe('MantisClient – HTTP methods', () => {
  it('sends POST with JSON body', () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(201, JSON.stringify({ id: 1 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    const payload = { summary: 'New issue', project: { id: 1 } };
    return client.post('issues', payload).then(() => {
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify(payload));
    });
  });

  it('sends PATCH request', () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(200, JSON.stringify({ id: 1 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    return client.patch('issues/1', { summary: 'Updated' }).then(() => {
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      expect(options.method).toBe('PATCH');
    });
  });

  it('sends DELETE request', () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(204, ''));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token');
    return client.delete('issues/1').then(() => {
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      expect(options.method).toBe('DELETE');
    });
  });
});

// ---------------------------------------------------------------------------
// Credential factory (lazy constructor)
// ---------------------------------------------------------------------------

describe('MantisClient – credential factory', () => {
  it('does not call the factory until the first API method', async () => {
    const factory = vi.fn().mockResolvedValue({
      baseUrl: 'https://lazy.example.com',
      apiKey: 'lazy-key',
    });

    new MantisClient(factory);

    expect(factory).not.toHaveBeenCalled();
  });

  it('calls the factory on first API method and uses the returned credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const factory = vi.fn().mockResolvedValue({
      baseUrl: 'https://lazy.example.com',
      apiKey: 'lazy-key',
    });

    const client = new MantisClient(factory);
    await client.get('issues');

    expect(factory).toHaveBeenCalledOnce();
    const calledUrl: string = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://lazy.example.com/api/rest/issues');
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>)['Authorization']).toBe('lazy-key');
  });

  it('caches credentials after the first call and does not call the factory again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', fetchMock);

    const factory = vi.fn().mockResolvedValue({
      baseUrl: 'https://lazy.example.com',
      apiKey: 'lazy-key',
    });

    const client = new MantisClient(factory);
    await client.get('issues');
    await client.get('projects');

    expect(factory).toHaveBeenCalledOnce();
  });

  it('forwards the responseObserver when using factory constructor', async () => {
    const observer = vi.fn();
    const fakeResponse = makeResponse(200, '{}');
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse);
    vi.stubGlobal('fetch', fetchMock);

    const factory = vi.fn().mockResolvedValue({
      baseUrl: 'https://lazy.example.com',
      apiKey: 'lazy-key',
    });

    const client = new MantisClient(factory, observer);
    await client.get('issues');

    expect(observer).toHaveBeenCalledOnce();
    expect(observer).toHaveBeenCalledWith(fakeResponse);
  });
});

// ---------------------------------------------------------------------------
// responseObserver
// ---------------------------------------------------------------------------

describe('MantisClient – responseObserver', () => {
  it('calls responseObserver on successful response', () => {
    const observer = vi.fn();
    const fakeResponse = makeResponse(200, '{}');
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse);
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token', observer);
    return client.get('issues').then(() => {
      expect(observer).toHaveBeenCalledOnce();
      expect(observer).toHaveBeenCalledWith(fakeResponse);
    });
  });

  it('does not call responseObserver on error response', async () => {
    const observer = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(500, JSON.stringify({ message: 'Internal Server Error' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new MantisClient('https://mantis.example.com', 'token', observer);
    await expect(client.get('issues')).rejects.toBeInstanceOf(MantisApiError);
    expect(observer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

describe('buildIssueViewUrl', () => {
  it('builds the correct MantisBT issue view URL', () => {
    expect(buildIssueViewUrl('https://mantis.example.com', 42))
      .toBe('https://mantis.example.com/view.php?id=42');
  });

  it('works with base URLs that have a path prefix', () => {
    expect(buildIssueViewUrl('https://example.com/mantis', 1))
      .toBe('https://example.com/mantis/view.php?id=1');
  });
});

describe('buildNoteViewUrl', () => {
  it('builds the correct MantisBT note anchor URL', () => {
    expect(buildNoteViewUrl('https://mantis.example.com', 42, 99))
      .toBe('https://mantis.example.com/view.php?id=42#bugnote99');
  });
});

describe('MantisClient – getBaseUrl', () => {
  it('returns the normalized base URL (direct constructor)', async () => {
    const client = new MantisClient('https://mantis.example.com', 'token');
    expect(await client.getBaseUrl()).toBe('https://mantis.example.com');
  });

  it('returns the base URL from the credential factory', async () => {
    const factory = vi.fn().mockResolvedValue({
      baseUrl: 'https://lazy.example.com',
      apiKey: 'key',
    });
    const client = new MantisClient(factory);
    expect(await client.getBaseUrl()).toBe('https://lazy.example.com');
  });
});
