import { open, readFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Sync lock
// ---------------------------------------------------------------------------

// Every MCP client session starts its own server process, and all of them share
// one index directory. The lock makes sure only one process syncs at a time —
// concurrent syncs would overwrite each other's index.json.

const LOCK_FILE = 'sync.lock';

// Fallback for a lock whose PID was reused by an unrelated process.
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

interface LockContent {
  pid: number;
  started_at: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function isStale(lockFile: string): Promise<boolean> {
  try {
    const content = JSON.parse(await readFile(lockFile, 'utf-8')) as LockContent;
    const age = Date.now() - new Date(content.started_at).getTime();
    return !isProcessAlive(content.pid) || Number.isNaN(age) || age >= STALE_AFTER_MS;
  } catch {
    // Unreadable, half-written or already removed — safe to (re)try taking it.
    return true;
  }
}

/**
 * Tries to take the sync lock in `dir`. Returns a release function, or null if
 * another live process currently holds the lock. Stale locks are taken over.
 */
export async function acquireSyncLock(dir: string): Promise<(() => Promise<void>) | null> {
  await mkdir(dir, { recursive: true });
  const lockFile = join(dir, LOCK_FILE);
  const content: LockContent = { pid: process.pid, started_at: new Date().toISOString() };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockFile, 'wx');
      await handle.writeFile(JSON.stringify(content), 'utf-8');
      await handle.close();
      return () => unlinkIfExists(lockFile);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (!(await isStale(lockFile))) return null;
      await unlinkIfExists(lockFile);
    }
  }
  return null;
}

async function unlinkIfExists(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
