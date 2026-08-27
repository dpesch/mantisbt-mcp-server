// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a MANTIS_BASE_URL so that it never ends with "/api/rest",
 * "/api/rest/index.php", or a trailing slash. The client appends the REST API
 * prefix itself, so URLs that already include it must not produce a doubled
 * prefix.
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/api\/rest(?:\/index\.php)?\/?$/, '').replace(/\/$/, '');
}

export function buildIssueViewUrl(baseUrl: string, issueId: number): string {
  return `${baseUrl}/view.php?id=${issueId}`;
}

export function buildNoteViewUrl(baseUrl: string, issueId: number, noteId: number): string {
  return `${baseUrl}/view.php?id=${issueId}#bugnote${noteId}`;
}

// ---------------------------------------------------------------------------
// MantisApiError
// ---------------------------------------------------------------------------

export class MantisApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(`MantisBT API error ${statusCode}: ${message}`);
    this.name = 'MantisApiError';
  }
}

// ---------------------------------------------------------------------------
// MantisClient
// ---------------------------------------------------------------------------

type ResponseObserver = (response: Response) => void;
type Credentials = { baseUrl: string; apiKey: string; useIndexPhp?: boolean };
type ResolvedCredentials = { baseUrl: string; apiKey: string; useIndexPhp: boolean };
type CredentialFactory = () => Promise<Credentials>;

export class MantisClient {
  private readonly credentialFactory?: CredentialFactory;
  private readonly responseObserver?: ResponseObserver;
  private resolvedCredentials?: ResolvedCredentials;

  constructor(baseUrl: string, apiKey: string, responseObserver?: ResponseObserver);
  constructor(baseUrl: string, apiKey: string, useIndexPhp: boolean, responseObserver?: ResponseObserver);
  constructor(credentialFactory: CredentialFactory, responseObserver?: ResponseObserver);
  constructor(
    baseUrlOrFactory: string | CredentialFactory,
    apiKeyOrObserver?: string | ResponseObserver,
    useIndexPhpOrObserver?: boolean | ResponseObserver,
    responseObserver?: ResponseObserver,
  ) {
    if (typeof baseUrlOrFactory === 'string') {
      const useIndexPhp = typeof useIndexPhpOrObserver === 'boolean' ? useIndexPhpOrObserver : false;
      this.resolvedCredentials = {
        baseUrl: normalizeBaseUrl(baseUrlOrFactory),
        apiKey: apiKeyOrObserver as string,
        useIndexPhp,
      };
      this.responseObserver = typeof useIndexPhpOrObserver === 'function'
        ? useIndexPhpOrObserver
        : responseObserver;
    } else {
      this.credentialFactory = baseUrlOrFactory;
      this.responseObserver = apiKeyOrObserver as ResponseObserver | undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getCredentials(): Promise<ResolvedCredentials> {
    if (!this.resolvedCredentials) {
      const { baseUrl, apiKey, useIndexPhp = false } = await this.credentialFactory!();
      this.resolvedCredentials = { baseUrl: normalizeBaseUrl(baseUrl), apiKey, useIndexPhp };
    }
    return this.resolvedCredentials;
  }

  async getBaseUrl(): Promise<string> {
    return (await this.getCredentials()).baseUrl;
  }

  private async buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<string> {
    const { baseUrl, useIndexPhp } = await this.getCredentials();
    const restPrefix = useIndexPhp ? '/api/rest/index.php/' : '/api/rest/';
    const url = new URL(`${baseUrl}${restPrefix}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async headers(): Promise<Record<string, string>> {
    const { apiKey } = await this.getCredentials();
    return {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      this.responseObserver?.(response);
      // Some DELETE endpoints return 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }
      const text = await response.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    }

    let message = response.statusText;
    try {
      const body = await response.text();
      if (body) {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) message = parsed.message;
        else message = body;
      }
    } catch {
      // ignore parse errors — keep statusText as message
    }

    throw new MantisApiError(response.status, message);
  }

  // ---------------------------------------------------------------------------
  // Public API methods
  // ---------------------------------------------------------------------------

  private static readonly TIMEOUT_MS = 30_000;

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const response = await fetch(await this.buildUrl(path, params), {
      method: 'GET',
      headers: await this.headers(),
      signal: AbortSignal.timeout(MantisClient.TIMEOUT_MS),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(await this.buildUrl(path), {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MantisClient.TIMEOUT_MS),
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(await this.buildUrl(path), {
      method: 'PATCH',
      headers: await this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MantisClient.TIMEOUT_MS),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(await this.buildUrl(path), {
      method: 'DELETE',
      headers: await this.headers(),
      signal: AbortSignal.timeout(MantisClient.TIMEOUT_MS),
    });
    return this.handleResponse<T>(response);
  }

  async getVersion(): Promise<string> {
    const response = await fetch(await this.buildUrl('users/me'), {
      method: 'GET',
      headers: await this.headers(),
      signal: AbortSignal.timeout(MantisClient.TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new MantisApiError(response.status, response.statusText);
    }
    return response.headers.get('X-Mantis-Version') ?? 'unknown';
  }
}
