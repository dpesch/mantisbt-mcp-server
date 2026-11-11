import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_SHA } from '../../scripts/hooks/pre-push.mjs';

// The pre-push hook end to end, without network: a local bare repository
// stands in for Codeberg. GIT_CONFIG_* rewrites the Codeberg URL to it for
// every git call the hook makes, so the hook still sees a Codeberg remote.

const hook = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'hooks', 'pre-push.mjs');
const CODEBERG_URL = 'ssh://git@codeberg.org/test/repo.git';

let tmp: string;
let work: string;
let bare: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' }).trim();

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pre-push-'));
  work = join(tmp, 'work');
  bare = join(tmp, 'codeberg.git');
  mkdirSync(join(work, '.claude'), { recursive: true });
  git(tmp, 'init', '-q', '--bare', bare);
  git(tmp, 'init', '-q', '-b', 'main', work);
  // The hook runs "npm run typecheck" first; keep it trivial here.
  writeFileSync(join(work, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node -e 0' } }));
  writeFileSync(join(work, 'README.md'), 'public\n');
  writeFileSync(join(work, '.claude', 'notes.md'), 'internal\n');
  git(work, 'add', '.');
  git(work, 'commit', '-q', '-m', 'Initial commit');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Runs the hook like git does for a push of HEAD to remoteRef on Codeberg,
 * plus the deletion of each ref in `deletions`.
 */
function push(remoteRef: string, deletions: string[] = []) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.${bare.replace(/\\/g, '/')}.insteadOf`,
    GIT_CONFIG_VALUE_0: CODEBERG_URL,
  };
  delete env._PREPUSH_FILTER_ACTIVE;
  const input = `refs/heads/main ${git(work, 'rev-parse', 'HEAD')} ${remoteRef} ${ZERO_SHA}\n`
    + deletions.map(ref => `(delete) ${ZERO_SHA} ${ref} ${'f'.repeat(40)}\n`).join('');
  return spawnSync(process.execPath, [hook, 'upstream', CODEBERG_URL], { cwd: work, env, input, encoding: 'utf8' });
}

// Each hook run starts npm and real git pushes — slow on Windows.
describe('pre-push hook against a stand-in Codeberg', { timeout: 30_000 }, () => {
  it('pushes the branch without .claude/ and blocks the unfiltered push', () => {
    const result = push('refs/heads/main');

    expect(result.status, result.stderr).toBe(2);
    expect(git(bare, 'ls-tree', '--name-only', 'main')).toBe('README.md\npackage.json');
  });

  it('refuses push input that is not a full ref name, before calling git', () => {
    const result = push('--upload-pack=touch');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Malformed push input');
    expect(git(bare, 'for-each-ref')).toBe('');
  });

  it('chains a later push onto the filtered commit already on Codeberg', () => {
    expect(push('refs/heads/main').status).toBe(2);
    writeFileSync(join(work, 'README.md'), 'public, updated\n');
    writeFileSync(join(work, '.claude', 'notes.md'), 'internal, updated\n');
    git(work, 'commit', '-q', '-am', 'Second commit');

    const result = push('refs/heads/main');

    expect(result.status, result.stderr).toBe(2);
    expect(git(bare, 'log', '--format=%s', 'main')).toBe('Second commit\nInitial commit');
    expect(git(bare, 'log', '--format=%H', 'main').split('\n').map(sha => git(bare, 'ls-tree', '--name-only', sha)))
      .toEqual(['README.md\npackage.json', 'README.md\npackage.json']);
  });

  // #8634: the hook blocks git's own push, so it must send deletions itself.
  it('deletes a ref when the same push also updates a branch', () => {
    expect(push('refs/heads/old').status).toBe(2);

    const result = push('refs/heads/main', ['refs/heads/old']);

    expect(result.status, result.stderr).toBe(2);
    expect(git(bare, 'for-each-ref', '--format=%(refname)')).toBe('refs/heads/main');
  });

  // #8620: ref names reach git as arguments, never through a shell. Both
  // shells' expansion syntax is valid in a ref name: $(…) for sh, %VAR% for cmd.
  it('passes a ref name with shell syntax through literally', () => {
    const ref = 'refs/heads/t$(echo${IFS}x)-a%OS%b';

    const result = push(ref);

    expect(result.status, result.stderr).toBe(2);
    expect(git(bare, 'for-each-ref', '--format=%(refname)')).toBe(ref);
  });
});
