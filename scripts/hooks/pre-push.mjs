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
//   6. Exits 2 to block git's unfiltered push
//      Exit codes: 0 = not Codeberg, or only deletions; 1 = error;
//      2 = filtered push done (or nothing new), unfiltered push blocked.
//      Exit 0 lets git run the original push, so for Codeberg it is only safe
//      when no ref carries commits (#8619).
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
import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const ZERO_SHA = '0'.repeat(40);

// Host of a git remote URL, lower-cased: URL form (ssh://, https://, git://)
// and scp form (user@host:path). Host names are case-insensitive, so a plain
// substring test let `Codeberg.org` slip past the filter (#8619).
const remoteHost = url => {
  if (!url) return '';
  try {
    if (url.includes('://')) return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
  const scp = /^(?:[^@/]+@)?([^:/]+):/.exec(url);
  return scp ? scp[1].toLowerCase() : '';
};

export const isCodebergRemote = url => remoteHost(url) === 'codeberg.org';

// A pre-push line is "<local ref> <local sha> <remote ref> <remote sha>"; a
// deletion has the zero SHA locally. Any other line would publish commits.
export const carriesCommits = lines => lines.some(line => line.split(' ')[1] !== ZERO_SHA);

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

const processRefs = (remoteUrl, lines) => {
  // Only deletions: git's own push publishes no commits, let it run. Any other
  // ref must not fall through to it, even when skipped below — git would send
  // it unfiltered (#8619).
  if (!carriesCommits(lines)) process.exit(0);

  // Process branches before tags so shaMap is populated when tags are handled.
  const branches = lines.filter(l => l.split(' ')[2]?.startsWith('refs/heads/'));
  const others   = lines.filter(l => !l.split(' ')[2]?.startsWith('refs/heads/'));

  // Batch-fetch all tags from Codeberg (single ls-remote call, ref → sha).
  const remoteTagsRaw = gitOptional(`ls-remote --tags "${remoteUrl}"`);
  const remoteTagMap = new Map(
    remoteTagsRaw
      ? remoteTagsRaw.split('\n').filter(Boolean)
          .map(l => { const [sha, ref] = l.split(/\s+/); return [ref, sha]; })
          .filter(([ref]) => ref)
      : []
  );

  // localSha → filteredSha, accumulated across all refs in this push.
  const shaMap = {};
  let pushed = 0;

  for (const line of [...branches, ...others]) {
    const parts = line.split(' ');
    if (parts.length < 3) { console.error(`✗ Malformed push input: ${line}`); process.exit(1); }
    const [, localSha, remoteRef] = parts;

    if (localSha === ZERO_SHA) continue; // deletion — skip

    const label = remoteRef.replace('refs/heads/', '').replace('refs/tags/', '');

    if (remoteRef.startsWith('refs/tags/')) {
      if (remoteTagMap.has(remoteRef)) {
        console.log(`  ↷ ${label} already on Codeberg — skipping`);
        continue;
      }
      if (!gitOptional(`rev-parse --verify "${localSha}"`)) {
        console.warn(`  ⚠ ${label} — commit ${localSha.slice(0, 8)} not found locally, skipping`);
        continue;
      }
    }

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

    // Tags: existing ones were skipped above, so only new tags reach here — no remote anchor.
    // Branches: query individually to find the incremental anchor for filtered chain building.
    const actualRemoteSha = remoteRef.startsWith('refs/tags/')
      ? ''
      : (gitOptional(`ls-remote "${remoteUrl}" "${remoteRef}"`)?.split(/\s+/)[0] ?? '');

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
        // Fallback: anchor not found — branch only (tags exit early above).
        const remoteExists = !!gitOptional(`rev-parse --verify "${actualRemoteSha}"`);
        console.warn(`  ⚠ Could not find local base for ${label}, filtering tip only`);
        shaMap[localSha] = makeFilteredCommit(localSha, filterTree(localSha), remoteExists ? [actualRemoteSha] : []);
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

  console.log(pushed === 0
    ? '→ Nothing new for Codeberg. Blocking unfiltered push.'
    : '→ Filtered push complete. Blocking unfiltered push.');
  process.exit(2); // 2 = success (filtered push done, unfiltered blocked); 1 = error
};

const main = () => {
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
  if (!isCodebergRemote(remoteUrl)) process.exit(0);

  console.log('→ Codeberg push detected — filtering .claude/ directory...');

  const rl = createInterface({ input: process.stdin });
  const lines = [];
  rl.on('line', line => { if (line.trim()) lines.push(line.trim()); });
  rl.on('close', () => processRefs(remoteUrl, lines));
};

// Tests import the helpers above without running the hook. Fail closed: skip
// main() only under Vitest when this file is not the entry point, so no stray
// environment variable can switch the filter off.
const isEntryPoint = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};
if (!process.env.VITEST || isEntryPoint()) main();
