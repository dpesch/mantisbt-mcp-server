import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseVersion, compareVersions, VersionHintService } from '../src/version-hint.js';

// ---------------------------------------------------------------------------
// parseVersion
// ---------------------------------------------------------------------------

describe('parseVersion()', () => {
  it('parses a standard version string', () => {
    expect(parseVersion('2.25.7')).toEqual([2, 25, 7]);
  });

  it('strips leading v prefix', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
  });

  it('returns null for invalid strings', () => {
    expect(parseVersion('not-a-version')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });

  it('ignores extra suffix after patch number', () => {
    expect(parseVersion('2.25.7-beta')).toEqual([2, 25, 7]);
  });
});

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------

describe('compareVersions()', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions([2, 25, 7], [2, 25, 7])).toBe(0);
  });

  it('returns -1 when first version is older (major)', () => {
    expect(compareVersions([1, 0, 0], [2, 0, 0])).toBe(-1);
  });

  it('returns 1 when first version is newer (major)', () => {
    expect(compareVersions([3, 0, 0], [2, 99, 99])).toBe(1);
  });

  it('compares minor version correctly', () => {
    expect(compareVersions([2, 24, 0], [2, 25, 0])).toBe(-1);
    expect(compareVersions([2, 26, 0], [2, 25, 0])).toBe(1);
  });

  it('compares patch version correctly', () => {
    expect(compareVersions([2, 25, 6], [2, 25, 7])).toBe(-1);
    expect(compareVersions([2, 25, 8], [2, 25, 7])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// VersionHintService – getUpdateHint()
// ---------------------------------------------------------------------------

describe('VersionHintService – getUpdateHint()', () => {
  it('returns null when installedVersion is not set', () => {
    const svc = new VersionHintService();
    expect(svc.getUpdateHint()).toBeNull();
  });

  it('returns null when latestVersion is not set', () => {
    const svc = new VersionHintService();
    // Simulate installed version via onSuccessfulResponse
    const mockResponse = {
      headers: { get: (key: string) => key === 'X-Mantis-Version' ? '2.25.6' : null },
    } as unknown as Response;
    svc.onSuccessfulResponse(mockResponse);
    expect(svc.getUpdateHint()).toBeNull();
  });

  it('returns hint string when latestVersion > installedVersion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: 'release-2.25.7' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new VersionHintService();

    const mockResponse = {
      headers: { get: (key: string) => key === 'X-Mantis-Version' ? '2.25.6' : null },
    } as unknown as Response;
    svc.onSuccessfulResponse(mockResponse);

    // Trigger fetch and wait for it to complete
    svc.triggerLatestVersionFetch();
    await svc.waitForLatestVersion(1000);

    const hint = svc.getUpdateHint();
    expect(hint).not.toBeNull();
    expect(hint).toContain('2.25.7');
    expect(hint).toContain('2.25.6');
  });

  it('returns null when installed version equals latest version', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: 'release-2.25.7' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new VersionHintService();

    const mockResponse = {
      headers: { get: (key: string) => key === 'X-Mantis-Version' ? '2.25.7' : null },
    } as unknown as Response;
    svc.onSuccessfulResponse(mockResponse);

    svc.triggerLatestVersionFetch();
    await svc.waitForLatestVersion(1000);

    expect(svc.getUpdateHint()).toBeNull();
  });

  it('returns null when installedVersion is newer than latestVersion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: 'release-2.25.6' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new VersionHintService();

    const mockResponse = {
      headers: { get: (key: string) => key === 'X-Mantis-Version' ? '2.25.7' : null },
    } as unknown as Response;
    svc.onSuccessfulResponse(mockResponse);

    svc.triggerLatestVersionFetch();
    await svc.waitForLatestVersion(1000);

    expect(svc.getUpdateHint()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VersionHintService – onSuccessfulResponse()
// ---------------------------------------------------------------------------

describe('VersionHintService – onSuccessfulResponse()', () => {
  it('extracts X-Mantis-Version header from response', () => {
    const svc = new VersionHintService();
    const mockResponse = {
      headers: { get: (key: string) => key === 'X-Mantis-Version' ? '2.25.7' : null },
    } as unknown as Response;

    svc.onSuccessfulResponse(mockResponse);
    expect(svc.getInstalledVersion()).toBe('2.25.7');
  });

  it('does not overwrite already set installedVersion', () => {
    const svc = new VersionHintService();

    const first = {
      headers: { get: (key: string) => key === 'X-Mantis-Version' ? '2.25.6' : null },
    } as unknown as Response;
    const second = {
      headers: { get: (key: string) => key === 'X-Mantis-Version' ? '2.25.7' : null },
    } as unknown as Response;

    svc.onSuccessfulResponse(first);
    svc.onSuccessfulResponse(second);

    expect(svc.getInstalledVersion()).toBe('2.25.6');
  });

  it('ignores response without X-Mantis-Version header', () => {
    const svc = new VersionHintService();
    const mockResponse = {
      headers: { get: (_key: string) => null },
    } as unknown as Response;

    svc.onSuccessfulResponse(mockResponse);
    expect(svc.getInstalledVersion()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VersionHintService – triggerLatestVersionFetch()
// ---------------------------------------------------------------------------

describe('VersionHintService – triggerLatestVersionFetch()', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('only triggers fetch once even when called multiple times', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: 'release-2.25.7' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new VersionHintService();
    svc.triggerLatestVersionFetch();
    svc.triggerLatestVersionFetch();
    svc.triggerLatestVersionFetch();
    await svc.waitForLatestVersion(1000);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('handles GitHub API errors gracefully (no crash, latestVersion stays null)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new VersionHintService();
    svc.triggerLatestVersionFetch();
    await svc.waitForLatestVersion(500);

    expect(svc.getLatestVersion()).toBeNull();
  });

  it('handles fetch network errors gracefully', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const svc = new VersionHintService();
    svc.triggerLatestVersionFetch();
    // Give async fire-and-forget time to complete
    await new Promise(r => setTimeout(r, 100));

    expect(svc.getLatestVersion()).toBeNull();
  });
});
