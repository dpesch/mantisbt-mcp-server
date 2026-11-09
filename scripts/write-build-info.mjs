#!/usr/bin/env node
// Writes dist/build-info.json: the version, commit and time of this build, so
// the server reports the code it runs and not whatever package.json says at
// runtime (#8547). Read by src/build-info.ts.
//
// Only the CI release job sets RELEASE_TAG (the pushed tag, e.g. v1.18.0):
// that build reports the plain version. Every other build — a local build,
// npm run dev — is marked -dev; npm publish refuses those (prepublishOnly).
//
// Usage: node scripts/write-build-info.mjs [--out <dir>]

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? resolve(args[outIndex + 1]) : join(root, 'dist');
const releaseTag = process.env.RELEASE_TAG;

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

if (releaseTag && releaseTag !== `v${version}`) {
  console.error(`write-build-info: RELEASE_TAG ${releaseTag} does not match package.json version ${version}`);
  process.exit(1);
}

/** Short HEAD hash, "-dirty" with uncommitted changes; undefined without git. */
function gitCommit() {
  try {
    const git = gitArgs => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const hash = git(['rev-parse', '--short', 'HEAD']);
    return git(['status', '--porcelain', '--untracked-files=no']) ? `${hash}-dirty` : hash;
  } catch {
    return undefined;
  }
}

const info = {
  version: releaseTag ? version : `${version}-dev`,
  commit: gitCommit(),
  built_at: new Date().toISOString(),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
console.error(`build-info: ${info.version} (${info.commit ?? 'no git commit'})`);
