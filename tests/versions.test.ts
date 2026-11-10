import { describe, it, expect } from 'vitest';
import { ancestorIds, collectVersions, type RawProject } from '../src/versions.js';
import type { MantisVersion } from '../src/types.js';

// Project 42 is the parent of 47; 47 is the parent of 50 (two levels).
const v = (id: number, extra: Partial<MantisVersion> = {}): MantisVersion => ({
  id,
  name: `v${id}`,
  released: false,
  obsolete: false,
  timestamp: `2026-01-${String(id % 28 + 1).padStart(2, '0')}T00:00:00+01:00`,
  ...extra,
});

const PARENT_ACTIVE = v(1);
const PARENT_OBSOLETE = v(2, { obsolete: true });
const OWN_ACTIVE = v(10);
const OWN_OBSOLETE = v(11, { obsolete: true });

// GET /projects embeds every version of a project, obsolete ones included,
// plus parent versions when subprojects_inherit_versions is ON.
const PROJECTS: RawProject[] = [
  { id: 42, versions: [PARENT_ACTIVE, PARENT_OBSOLETE], subProjects: [{ id: 47 }] },
  { id: 47, versions: [OWN_ACTIVE, OWN_OBSOLETE, PARENT_ACTIVE, PARENT_OBSOLETE], subProjects: [{ id: 50 }] },
  { id: 50, versions: [] },
  { id: 60, versions: [v(20), v(21, { obsolete: true })] },
];

const ids = (versions: MantisVersion[]) => versions.map(x => x.id).sort((a, b) => a - b);

describe('ancestorIds', () => {
  it('returns no ancestors for a top-level project', () => {
    expect(ancestorIds(PROJECTS, 42)).toEqual([]);
  });

  it('returns all ancestors across several levels', () => {
    expect(ancestorIds(PROJECTS, 50).sort()).toEqual([42, 47]);
  });

  it('survives a cyclic hierarchy', () => {
    const cyclic: RawProject[] = [{ id: 1, subProjects: [{ id: 2 }] }, { id: 2, subProjects: [{ id: 1 }] }];
    expect(ancestorIds(cyclic, 1)).toEqual([2]);
  });
});

describe('collectVersions (#8614)', () => {
  // The /versions endpoint of MantisBT 2.28.4 ignores obsolete/inherit and
  // returns only own, non-obsolete versions.
  const own = [OWN_ACTIVE];

  it('obsolete: adds obsolete versions missing from /versions', () => {
    const result = collectVersions({ own: [v(20)], projects: PROJECTS, projectId: 60, obsolete: true, inherit: false });
    expect(ids(result)).toEqual([20, 21]);
  });

  it('obsolete without inherit: excludes parent versions of a subproject', () => {
    const result = collectVersions({ own, projects: PROJECTS, projectId: 47, obsolete: true, inherit: false });
    expect(ids(result)).toEqual([10, 11]);
  });

  it('inherit without obsolete: adds active parent versions only', () => {
    const result = collectVersions({ own, projects: PROJECTS, projectId: 47, obsolete: false, inherit: true });
    expect(ids(result)).toEqual([1, 10]);
  });

  it('obsolete and inherit: returns everything', () => {
    const result = collectVersions({ own, projects: PROJECTS, projectId: 47, obsolete: true, inherit: true });
    expect(ids(result)).toEqual([1, 2, 10, 11]);
  });

  it('inherit: adds parent versions even when the server does not embed them', () => {
    // subprojects_inherit_versions = OFF: the detail lists only own versions
    const projects: RawProject[] = [
      { id: 42, versions: [PARENT_ACTIVE], subProjects: [{ id: 47 }] },
      { id: 47, versions: [OWN_ACTIVE] },
    ];
    const result = collectVersions({ own, projects, projectId: 47, obsolete: false, inherit: true });
    expect(ids(result)).toEqual([1, 10]);
  });

  it('inherit: walks up several levels', () => {
    const result = collectVersions({ own: [], projects: PROJECTS, projectId: 50, obsolete: true, inherit: true });
    expect(ids(result)).toEqual([1, 2, 10, 11]);
  });

  it('does not duplicate versions when /versions already honours the parameters', () => {
    const result = collectVersions({ own: [OWN_ACTIVE, OWN_OBSOLETE], projects: PROJECTS, projectId: 47, obsolete: true, inherit: false });
    expect(ids(result)).toEqual([10, 11]);
  });

  it('falls back to /versions when the project is missing from GET /projects', () => {
    const result = collectVersions({ own, projects: [], projectId: 47, obsolete: true, inherit: true });
    expect(result).toEqual([OWN_ACTIVE]);
  });

  it('sorts newest first, like MantisBT', () => {
    const result = collectVersions({ own: [], projects: PROJECTS, projectId: 47, obsolete: true, inherit: true });
    const times = result.map(x => Date.parse(x.timestamp!));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('drops a blank description, matching the /versions shape', () => {
    const projects: RawProject[] = [{ id: 60, versions: [v(21, { obsolete: true, description: '' })] }];
    const [version] = collectVersions({ own: [], projects, projectId: 60, obsolete: true, inherit: false });
    expect(version).not.toHaveProperty('description');
  });
});
