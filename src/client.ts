// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a MANTIS_BASE_URL so that it never ends with "/api/rest" or a
 * trailing slash.  The client always appends "/api/rest/<path>" itself, so
 * users who follow README examples that include "/api/rest" in the URL must
 * not end up with a doubled prefix.
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/api\/rest\/?$/, '').replace(/\/$/, '');
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
type CredentialFactory = () => Promise<{ baseUrl: string; apiKey: string }>;

export class MantisClient {
  private readonly credentialFactory?: CredentialFactory;
  private readonly responseObserver?: ResponseObserver;
  private resolvedCredentials?: { baseUrl: string; apiKey: string };

  constructor(baseUrl: string, apiKey: string, responseObserver?: ResponseObserver);
  constructor(credentialFactory: CredentialFactory, responseObserver?: ResponseObserver);
  constructor(
    baseUrlOrFactory: string | CredentialFactory,
    apiKeyOrObserver?: string | ResponseObserver,
    responseObserver?: ResponseObserver,
  ) {
    if (typeof baseUrlOrFactory === 'string') {
      this.resolvedCredentials = { baseUrl: normalizeBaseUrl(baseUrlOrFactory), apiKey: apiKeyOrObserver as string };
      this.responseObserver = responseObserver;
    } else {
      this.credentialFactory = baseUrlOrFactory;
      this.responseObserver = apiKeyOrObserver as ResponseObserver | undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getCredentials(): Promise<{ baseUrl: string; apiKey: string }> {
    if (!this.resolvedCredentials) {
      const { baseUrl, apiKey } = await this.credentialFactory!();
      this.resolvedCredentials = { baseUrl: normalizeBaseUrl(baseUrl), apiKey };
    }
    return this.resolvedCredentials;
  }

  private async buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<string> {
    const { baseUrl } = await this.getCredentials();
    const url = new URL(`${baseUrl}/api/rest/${path}`);
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

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const response = await fetch(await this.buildUrl(path, params), {
      method: 'GET',
      headers: await this.headers(),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(await this.buildUrl(path), {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(await this.buildUrl(path), {
      method: 'PATCH',
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(await this.buildUrl(path), {
      method: 'DELETE',
      headers: await this.headers(),
    });
    return this.handleResponse<T>(response);
  }

  async postFormData<T>(path: string, formData: FormData): Promise<T> {
    // Note: Content-Type must NOT be set here — fetch sets it automatically
    // with the correct multipart/form-data boundary.
    const { apiKey } = await this.getCredentials();
    const response = await fetch(await this.buildUrl(path), {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Accept': 'application/json',
      },
      body: formData,
    });
    return this.handleResponse<T>(response);
  }

  async getVersion(): Promise<string> {
    const response = await fetch(await this.buildUrl('users/me'), {
      method: 'GET',
      headers: await this.headers(),
    });
    if (!response.ok) {
      throw new MantisApiError(response.status, response.statusText);
    }
    return response.headers.get('X-Mantis-Version') ?? 'unknown';
  }
}
