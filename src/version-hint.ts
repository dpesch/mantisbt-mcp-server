// ---------------------------------------------------------------------------
// Version parsing utilities
// ---------------------------------------------------------------------------

export function parseVersion(raw: string): [number, number, number] | null {
  const match = raw.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

export function compareVersions(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// VersionHintService
// ---------------------------------------------------------------------------

const MANTISBT_TAGS_URL = 'https://api.github.com/repos/mantisbt/mantisbt/tags?per_page=10';

/**
 * Reads the installed MantisBT version from API response headers and lazily
 * fetches the latest release from GitHub. Provides a non-blocking update hint
 * that can be appended to API error messages.
 *
 * Intentionally has no imports from the rest of this project to avoid
 * circular dependencies.
 */
export class VersionHintService {
  private installedVersion: string | null = null;
  private latestVersion: string | null = null;
  private fetchStarted = false;

  /** Called by MantisClient after every successful API response. */
  onSuccessfulResponse(response: Response): void {
    if (!this.installedVersion) {
      const v = response.headers.get('X-Mantis-Version');
      if (v) this.installedVersion = v;
    }
  }

  /**
   * Starts the GitHub fetch exactly once (fire-and-forget).
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  triggerLatestVersionFetch(): void {
    if (this.fetchStarted) return;
    this.fetchStarted = true;
    void this.doFetch();
  }

  private async doFetch(): Promise<void> {
    try {
      const resp = await fetch(MANTISBT_TAGS_URL, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'mantisbt-mcp-server',
        },
      });
      if (!resp.ok) return;
      const tags = await resp.json() as Array<{ name: string }>;
      const tag = tags.find(t => /^release-\d+\.\d+\.\d+$/.test(t.name));
      this.latestVersion = tag ? tag.name.replace('release-', '') : null;
    } catch {
      // Network error — no hint, no crash
    }
  }

  /**
   * Returns an update hint string if a newer version is known, or null.
   * Never blocks — returns null while the GitHub fetch is still in flight.
   */
  getUpdateHint(): string | null {
    if (!this.installedVersion || !this.latestVersion) return null;
    const installed = parseVersion(this.installedVersion);
    const latest = parseVersion(this.latestVersion);
    if (!installed || !latest) return null;
    if (compareVersions(installed, latest) < 0) {
      return (
        `Note: MantisBT ${this.latestVersion} is available ` +
        `(installed: ${this.installedVersion}) — updating may resolve this issue.`
      );
    }
    return null;
  }

  getInstalledVersion(): string | null { return this.installedVersion; }
  getLatestVersion(): string | null { return this.latestVersion; }

  /**
   * Waits up to `timeoutMs` for the GitHub fetch to complete.
   * Used by the get_mantis_version tool where blocking is acceptable.
   */
  async waitForLatestVersion(timeoutMs = 5000): Promise<string | null> {
    if (this.latestVersion !== null) return this.latestVersion;
    if (!this.fetchStarted) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.latestVersion !== null) return this.latestVersion;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton (one per server process)
// ---------------------------------------------------------------------------

let globalInstance: VersionHintService | null = null;

export function setGlobalVersionHint(svc: VersionHintService): void {
  globalInstance = svc;
}

export function getVersionHint(): VersionHintService | null {
  return globalInstance;
}
