#!/usr/bin/env node
// prepublishOnly guard (#8547): refuses to publish unless dist/ is the release
// build of package.json's version. Any other build is marked -dev by
// scripts/write-build-info.mjs and must never reach npm.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = file => JSON.parse(readFileSync(join(root, file), 'utf-8'));

const { version } = readJson('package.json');
let built;
try {
  built = readJson('dist/build-info.json').version;
} catch {
  built = '(no dist/build-info.json)';
}

if (built !== version) {
  console.error(`check-release-build: dist reports ${built}, package.json ${version}. Publish only the release build: RELEASE_TAG=v${version} npm run build`);
  process.exit(1);
}
