import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireSyncLock } from '../../src/search/sync-lock.js';

// A PID far above any real process ID — process.kill(pid, 0) reports it as gone.
const DEAD_PID = 2_000_000_000;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mantis-sync-lock-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('acquireSyncLock', () => {
  it('creates the lock file with the current PID', async () => {
    const release = await acquireSyncLock(dir);

    expect(release).not.toBeNull();
    const content = JSON.parse(await readFile(join(dir, 'sync.lock'), 'utf-8')) as { pid: number };
    expect(content.pid).toBe(process.pid);
  });

  it('returns null while another live process holds the lock', async () => {
    const first = await acquireSyncLock(dir);
    const second = await acquireSyncLock(dir);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('can be acquired again after release', async () => {
    const first = await acquireSyncLock(dir);
    await first!();

    expect(await exists(join(dir, 'sync.lock'))).toBe(false);
    expect(await acquireSyncLock(dir)).not.toBeNull();
  });

  it('takes over a lock whose process is gone', async () => {
    await writeFile(
      join(dir, 'sync.lock'),
      JSON.stringify({ pid: DEAD_PID, started_at: new Date().toISOString() }),
      'utf-8',
    );

    expect(await acquireSyncLock(dir)).not.toBeNull();
  });

  it('takes over a lock older than the stale threshold', async () => {
    await writeFile(
      join(dir, 'sync.lock'),
      JSON.stringify({ pid: process.pid, started_at: '2020-01-01T00:00:00Z' }),
      'utf-8',
    );

    expect(await acquireSyncLock(dir)).not.toBeNull();
  });

  it('takes over an unreadable lock file', async () => {
    await writeFile(join(dir, 'sync.lock'), 'not json', 'utf-8');

    expect(await acquireSyncLock(dir)).not.toBeNull();
  });

  it('creates the directory if it does not exist yet', async () => {
    const nested = join(dir, 'search');

    expect(await acquireSyncLock(nested)).not.toBeNull();
  });
});
