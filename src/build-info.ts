import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** What this server reports about itself (get_version, MCP handshake, log). */
export interface BuildInfo {
  /** package.json version at build time; "-dev" unless built by the CI release job. */
  version: string;
  /** Short commit hash of the build, "-dirty" with uncommitted changes. */
  commit?: string;
  /** ISO-8601 build time. */
  built_at?: string;
}

/**
 * Reads build-info.json, which scripts/write-build-info.mjs writes next to the
 * compiled code. The version thus belongs to the code that runs, even when
 * package.json was bumped after the build (#8547). Code run straight from
 * src/ (tests, tsx) has no build: it reports package.json's version as -dev.
 */
export function loadBuildInfo(codeDir: string): BuildInfo {
  try {
    return JSON.parse(readFileSync(join(codeDir, 'build-info.json'), 'utf-8')) as BuildInfo;
  } catch {
    const pkg = JSON.parse(readFileSync(join(codeDir, '..', 'package.json'), 'utf-8')) as { version: string };
    return { version: `${pkg.version}-dev` };
  }
}
