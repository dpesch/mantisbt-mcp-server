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

export class MantisClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly responseObserver?: ResponseObserver;

  constructor(baseUrl: string, apiKey: string, responseObserver?: ResponseObserver) {
    // Ensure base URL ends without trailing slash; we always append /api/rest/
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.responseObserver = responseObserver;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}/api/rest/${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': this.apiKey,
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
    const response = await fetch(this.buildUrl(path, params), {
      method: 'GET',
      headers: this.headers(),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: 'DELETE',
      headers: this.headers(),
    });
    return this.handleResponse<T>(response);
  }

  async postFormData<T>(path: string, formData: FormData): Promise<T> {
    // Note: Content-Type must NOT be set here — fetch sets it automatically
    // with the correct multipart/form-data boundary.
    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Accept': 'application/json',
      },
      body: formData,
    });
    return this.handleResponse<T>(response);
  }

  async getVersion(): Promise<string> {
    const response = await fetch(this.buildUrl('users/me'), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new MantisApiError(response.status, response.statusText);
    }
    return response.headers.get('X-Mantis-Version') ?? 'unknown';
  }
}
