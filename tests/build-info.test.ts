import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBuildInfo } from '../src/build-info.js';

// ---------------------------------------------------------------------------
// Build info (#8547): the server reports the version it was built from, not
// the one package.json holds at runtime, and marks everything but a CI
// release build with -dev.
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'write-build-info.mjs');
const pkgVersion = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { version: string }).version;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'build-info-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('loadBuildInfo', () => {
  it('reads build-info.json next to the code', () => {
    const info = { version: '1.18.0', commit: 'abc1234', built_at: '2026-11-09T12:00:00.000Z' };
    writeFileSync(join(tmp, 'build-info.json'), JSON.stringify(info));

    expect(loadBuildInfo(tmp)).toEqual(info);
  });

  it('falls back to package.json with -dev when no build wrote build-info.json', () => {
    const codeDir = join(tmp, 'src');
    mkdirSync(codeDir);
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ version: '1.18.0' }));

    expect(loadBuildInfo(codeDir)).toEqual({ version: '1.18.0-dev' });
  });
});

describe('scripts/write-build-info.mjs', () => {
  /** Runs the script into tmp; RELEASE_TAG from the outer environment never leaks in. */
  function run(releaseTag?: string) {
    const env = { ...process.env };
    delete env.RELEASE_TAG;
    if (releaseTag !== undefined) env.RELEASE_TAG = releaseTag;
    return spawnSync(process.execPath, [script, '--out', tmp], { cwd: root, env, encoding: 'utf-8' });
  }
  const written = () => JSON.parse(readFileSync(join(tmp, 'build-info.json'), 'utf-8')) as Record<string, string>;

  it('marks a build without release tag as -dev and records commit and build time', () => {
    const before = Date.now();

    expect(run().status).toBe(0);

    const info = written();
    expect(info.version).toBe(`${pkgVersion}-dev`);
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim();
    expect(info.commit).toMatch(new RegExp(`^${head}(-dirty)?$`));
    expect(new Date(info.built_at!).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('reports the plain version for the release build of its tag', () => {
    expect(run(`v${pkgVersion}`).status).toBe(0);

    expect(written().version).toBe(pkgVersion);
  });

  it('fails when the release tag does not match package.json', () => {
    const result = run('v0.0.1');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('v0.0.1');
    expect(existsSync(join(tmp, 'build-info.json'))).toBe(false);
  });
});
