#!/usr/bin/env node
// Project setup script — run via: npm run init
//
// Steps:
//   1. Check Node.js version (requires >=18)
//   2. Install dependencies (npm install)
//   3. Install git hooks from scripts/hooks/ into .git/hooks/
//   4. Run typecheck to verify the setup

import { spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Auf Windows .cmd-Dateien via cmd.exe aufrufen — kein shell:true nötig, keine Deprecation-Warnung
const [npmBin, npmBaseArgs] = process.platform === 'win32'
  ? ['cmd.exe', ['/c', 'npm']]
  : ['npm', []];

// ---------------------------------------------------------------------------
// 1. Node.js version check
// ---------------------------------------------------------------------------

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error(`✗ Node.js >= 18 required, found ${process.version}`);
  process.exit(1);
}
console.log(`✓ Node.js ${process.version}`);

// ---------------------------------------------------------------------------
// 2. Install dependencies
// ---------------------------------------------------------------------------

console.log('\n→ Installing dependencies...');
const install = spawnSync(npmBin, [...npmBaseArgs, 'install'], {
  stdio: 'inherit',
  cwd: root,
});
if (install.status !== 0) {
  console.error('✗ npm install failed');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Install git hooks
// ---------------------------------------------------------------------------

console.log('\n→ Installing git hooks...');

const hooksSourceDir = resolve(root, 'scripts/hooks');
const gitHooksDir = resolve(root, '.git/hooks');

if (!existsSync(gitHooksDir)) {
  mkdirSync(gitHooksDir, { recursive: true });
}

const hooks = ['pre-push'];
for (const hook of hooks) {
  const src = resolve(hooksSourceDir, `${hook}.mjs`);
  const dest = resolve(gitHooksDir, hook);

  if (!existsSync(src)) {
    console.warn(`  ⚠ Hook source not found, skipping: scripts/hooks/${hook}.mjs`);
    continue;
  }

  copyFileSync(src, dest);

  // chmod +x (no-op on Windows — git runs hooks directly via shebang)
  try {
    chmodSync(dest, 0o755);
  } catch {
    // Silently ignore on platforms that don't support chmod
  }

  console.log(`  ✓ .git/hooks/${hook} installed`);
}

// ---------------------------------------------------------------------------
// 4. Typecheck
// ---------------------------------------------------------------------------

console.log('\n→ Running typecheck...');
const check = spawnSync(npmBin, [...npmBaseArgs, 'run', 'typecheck'], {
  stdio: 'inherit',
  cwd: root,
});
if (check.status !== 0) {
  console.error('✗ Typecheck failed — check type errors above');
  process.exit(1);
}

console.log('\n✓ Setup complete. Happy hacking!');
