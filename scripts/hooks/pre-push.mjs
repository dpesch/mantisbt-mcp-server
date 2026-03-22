#!/usr/bin/env node
// pre-push hook — typecheck gate + Codeberg .claude/ filter
//
// Typecheck runs for every push (origin and upstream) to catch type errors
// before they reach CI.
//
// Codeberg filter handles multi-commit pushes correctly:
//   1. Fetches the actual Codeberg tip via ls-remote
//   2. Finds the local commit whose filtered tree matches that tip (anchor)
//   3. Filters every commit between anchor and tip in order (oldest first)
//   4. Builds a proper filtered chain anchored to the actual remote tip
//   5. Pushes the filtered tip with --force
//   6. Exits 1 to block git's unfiltered push
//
// Branches are processed before tags so the shaMap is available for tags
// that point to commits already processed as part of the branch.
//
// ⚠ IMPORTANT: upstream (Codeberg) is a filtered mirror — push-only.
// Never run git pull, git fetch + merge, or git rebase against upstream.
// Filtered commits have different SHAs; pulling them back creates duplicate
// history. Use origin (Gitolite) as the authoritative source.
//
// --force is always required for Codeberg: filtered SHAs structurally diverge
// from local SHAs, so git rejects main as non-fast-forward before the hook
// runs unless --force bypasses that check.

import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

// Recursion guard — must be first to avoid running typecheck during recursive pushes
if (process.env._PREPUSH_FILTER_ACTIVE) process.exit(0);

// Run typecheck before every push (catches type errors before they hit CI)
try {
  execSync('npm run typecheck', { stdio: 'inherit' });
} catch {
  console.error('✗ Typecheck failed — push aborted. Fix type errors first.');
  process.exit(1);
}

const [,, , remoteUrl] = process.argv;

// Only intercept Codeberg pushes for the filter step
if (!remoteUrl?.includes('codeberg.org')) process.exit(0);

console.log('→ Codeberg push detected — filtering .claude/ directory...');

const ZERO_SHA = '0'.repeat(40);

const git = (cmd, opts = {}) => {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', ...opts }).trim();
  } catch (err) {
    console.error(`✗ git ${cmd}\n${err.stderr || err.message}`);
    process.exit(1);
  }
};

const gitOptional = (cmd, opts = {}) => {
  try { return execSync(`git ${cmd}`, { encoding: 'utf8', ...opts }).trim(); }
  catch { return ''; }
};

const isSha = s => /^[0-9a-f]{40}$/.test(s);

// Remove .claude/ from the root tree of a commit and return the new tree SHA.
const filterTree = commitSha => {
  const entries = git(`ls-tree "${commitSha}^{tree}"`);
  const filtered = entries.split('\n').filter(e => !e.match(/\t\.claude$/)).join('\n');
  const tree = git('mktree', { input: filtered });
  if (!isSha(tree)) { console.error(`✗ mktree failed for ${commitSha}`); process.exit(1); }
  return tree;
};

// Create a filtered commit object preserving all original metadata.
const makeFilteredCommit = (commitSha, filteredTree, mappedParents) => {
  const log = git(`log -1 --format=%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%n%B "${commitSha}"`);
  const [an, ae, aI, cn, ce, cI, , ...msgLines] = log.split('\n');
  const commitMsg = msgLines.join('\n').trimEnd();
  const parentFlags = mappedParents.map(p => `-p ${p}`).join(' ');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: an,    GIT_AUTHOR_EMAIL: ae,    GIT_AUTHOR_DATE: aI,
    GIT_COMMITTER_NAME: cn, GIT_COMMITTER_EMAIL: ce, GIT_COMMITTER_DATE: cI,
  };
  const result = git(`commit-tree "${filteredTree}" ${parentFlags}`, { env, input: commitMsg });
  if (!isSha(result)) { console.error(`✗ commit-tree failed for ${commitSha}`); process.exit(1); }
  return result;
};

// Scan ancestors of tipSha (newest first) and return the most recent one whose
// filtered root tree equals the tree of remoteSha. Returns null if not found.
const findLocalAnchor = (tipSha, remoteSha, maxDepth = 100) => {
  const remoteTree = gitOptional(`rev-parse "${remoteSha}^{tree}"`);
  if (!remoteTree) return null;
  const candidates = gitOptional(`rev-list --max-count=${maxDepth} "${tipSha}"`);
  if (!candidates) return null;
  for (const sha of candidates.split('\n').filter(Boolean)) {
    if (filterTree(sha) === remoteTree) return sha;
  }
  return null;
};

const rl = createInterface({ input: process.stdin });
const lines = [];
rl.on('line', line => { if (line.trim()) lines.push(line.trim()); });

rl.on('close', () => {
  // Process branches before tags so shaMap is populated when tags are handled.
  const branches = lines.filter(l => l.split(' ')[2]?.startsWith('refs/heads/'));
  const others   = lines.filter(l => !l.split(' ')[2]?.startsWith('refs/heads/'));

  // localSha → filteredSha, accumulated across all refs in this push.
  const shaMap = {};
  let pushed = 0;

  for (const line of [...branches, ...others]) {
    const parts = line.split(' ');
    if (parts.length < 3) { console.error(`✗ Malformed push input: ${line}`); process.exit(1); }
    const [, localSha, remoteRef] = parts;

    if (localSha === ZERO_SHA) continue; // deletion — skip

    const label = remoteRef.replace('refs/heads/', '').replace('refs/tags/', '');

    // If this commit was already filtered as part of a branch push, reuse it.
    if (localSha in shaMap) {
      try {
        execSync(`git push "${remoteUrl}" "${shaMap[localSha]}:${remoteRef}" --force`,
          { env: { ...process.env, _PREPUSH_FILTER_ACTIVE: '1' }, stdio: 'inherit' });
      } catch {
        console.error(`✗ Push failed for ${label}`); process.exit(1);
      }
      console.log(`✓ ${label} pushed to Codeberg (without .claude/)`);
      pushed++;
      continue;
    }

    // Get the actual current SHA on Codeberg for this ref.
    const lsOut = gitOptional(`ls-remote "${remoteUrl}" "${remoteRef}"`);
    const actualRemoteSha = lsOut ? lsOut.split(/\s+/)[0] : '';

    if (!actualRemoteSha) {
      // New ref on Codeberg — filter the tip with no parent.
      shaMap[localSha] = makeFilteredCommit(localSha, filterTree(localSha), []);
    } else {
      // Find the local commit that corresponds to the current Codeberg tip.
      const localAnchor = findLocalAnchor(localSha, actualRemoteSha);

      if (localAnchor) {
        shaMap[localAnchor] = actualRemoteSha;

        // Filter all commits between anchor and tip, oldest first.
        const revList = gitOptional(`rev-list --reverse "${localAnchor}..${localSha}"`);
        const commits = revList ? revList.split('\n').filter(Boolean) : [];

        for (const sha of commits) {
          const filteredTree = filterTree(sha);
          const parents = gitOptional(`log -1 --format=%P "${sha}"`);
          const parentShas = parents ? parents.split(' ').filter(Boolean) : [];
          // Map each parent through shaMap; fall back to actualRemoteSha for
          // parents outside the current range (already on the remote).
          const mappedParents = parentShas
            .map(p => shaMap[p] ?? actualRemoteSha)
            .filter(Boolean);
          shaMap[sha] = makeFilteredCommit(sha, filteredTree, mappedParents);
        }
      } else {
        // Fallback: anchor not found — filter tip only, rooted at remote tip.
        console.warn(`  ⚠ Could not find local base for ${label}, filtering tip only`);
        shaMap[localSha] = makeFilteredCommit(localSha, filterTree(localSha), [actualRemoteSha]);
      }
    }

    const filteredTip = shaMap[localSha];
    if (!filteredTip) {
      console.error(`✗ Could not compute filtered SHA for ${localSha}`);
      process.exit(1);
    }

    try {
      execSync(`git push "${remoteUrl}" "${filteredTip}:${remoteRef}" --force`,
        { env: { ...process.env, _PREPUSH_FILTER_ACTIVE: '1' }, stdio: 'inherit' });
    } catch {
      console.error(`✗ Push to Codeberg failed for ${label}`); process.exit(1);
    }

    console.log(`✓ ${label} pushed to Codeberg (without .claude/)`);
    pushed++;
  }

  if (pushed === 0) process.exit(0);
  console.log('→ Filtered push complete. Blocking unfiltered push.');
  process.exit(1);
});
