import { describe, it, expect, beforeAll } from 'vitest';

// #8619: decisions that keep unfiltered commits away from Codeberg.
// Under Vitest the hook skips its main part when imported.
let hook: typeof import('../../scripts/hooks/pre-push.mjs');
beforeAll(async () => {
  hook = await import('../../scripts/hooks/pre-push.mjs');
});

describe('isCodebergRemote', () => {
  it.each([
    'ssh://git@codeberg.org/dpesch/mantisbt-mcp-server.git',
    'ssh://git@Codeberg.ORG/dpesch/mantisbt-mcp-server.git',
    'ssh://git@codeberg.org:22/dpesch/mantisbt-mcp-server.git',
    'https://codeberg.org/dpesch/mantisbt-mcp-server.git',
    'HTTPS://CODEBERG.ORG/dpesch/mantisbt-mcp-server.git',
    'git@codeberg.org:dpesch/mantisbt-mcp-server.git',
    'git@CodeBerg.org:dpesch/mantisbt-mcp-server.git',
    'codeberg.org:dpesch/mantisbt-mcp-server.git',
  ])('recognises %s', url => {
    expect(hook.isCodebergRemote(url)).toBe(true);
  });

  it.each([
    'git@git.dev.example.local:projects/dom/mantisbt-mcp-server',
    'git@github.com:dpesch/mantisbt-mcp-server.git',
    'https://example.com/codeberg.org/repo.git',
    'https://codeberg.org.example.com/repo.git',
    '/srv/git/codeberg.org.git',
    '',
    undefined,
  ])('does not treat %s as Codeberg', url => {
    expect(hook.isCodebergRemote(url)).toBe(false);
  });
});

describe('carriesCommits', () => {
  const sha = 'a'.repeat(40);
  const line = (localSha: string, ref: string) => `${ref} ${localSha} ${ref} ${'b'.repeat(40)}`;

  it('is false when every ref is a deletion — git may run its own push', () => {
    expect(hook.carriesCommits([line(hook.ZERO_SHA, 'refs/tags/v1.0.0'), line(hook.ZERO_SHA, 'refs/heads/old')])).toBe(false);
    expect(hook.carriesCommits([])).toBe(false);
  });

  it('is true for a forced update of an existing tag, even if the hook skips it', () => {
    expect(hook.carriesCommits([line(sha, 'refs/tags/v1.0.0')])).toBe(true);
  });

  it('is true when deletions and updates are mixed', () => {
    expect(hook.carriesCommits([line(hook.ZERO_SHA, 'refs/heads/old'), line(sha, 'refs/heads/main')])).toBe(true);
  });
});
