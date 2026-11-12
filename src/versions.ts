import type { MantisClient } from './client.js';
import type { MantisVersion } from './types.js';

/**
 * Project versions, worked around a MantisBT REST defect (#8614).
 *
 * The handler of GET /projects/{id}/versions (rest_project_version_get in
 * MantisBT 2.28.4) passes only project_id and version_id to VersionGetCommand
 * and drops obsolete, inherit and released. The endpoint therefore always
 * returns the project's own, non-obsolete versions.
 *
 * GET /projects lists every accessible project, subprojects included, and
 * embeds all versions of each: obsolete ones, and parent versions when
 * subprojects_inherit_versions is ON. The subProjects references give the
 * hierarchy, so obsolete and inherited versions can be rebuilt from it.
 *
 * Limitation: a parent project the API user cannot see is missing from
 * GET /projects. Its versions, embedded in the subproject, then cannot be told
 * apart from the subproject's own and stay in the result even without inherit.
 */

/** A project entry as GET /projects returns it, reduced to what is needed here. */
export interface RawProject {
  id: number;
  versions?: MantisVersion[];
  subProjects?: Array<{ id: number }>;
}

interface VersionOptions {
  obsolete?: boolean;
  inherit?: boolean;
}

/** All projects that have the given project as a direct or indirect subproject. */
export function ancestorIds(projects: RawProject[], projectId: number): number[] {
  const parentsOf = new Map<number, number[]>();
  for (const project of projects) {
    for (const sub of project.subProjects ?? []) {
      const parents = parentsOf.get(sub.id);
      if (parents) parents.push(project.id);
      else parentsOf.set(sub.id, [project.id]);
    }
  }
  const found = new Set<number>();
  const queue = [...(parentsOf.get(projectId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === projectId || found.has(id)) continue;
    found.add(id);
    queue.push(...(parentsOf.get(id) ?? []));
  }
  return [...found];
}

/** /versions omits a blank description; GET /projects always sends one. */
function normalizeVersion(version: MantisVersion): MantisVersion {
  if (version.description === undefined || version.description.trim() !== '') return version;
  const { description: _blank, ...rest } = version;
  return rest;
}

const timeOf = (version: MantisVersion): number => {
  const time = version.timestamp ? Date.parse(version.timestamp) : NaN;
  return Number.isNaN(time) ? -Infinity : time;
};

/**
 * Combines the /versions response with the versions embedded in GET /projects.
 * Should a MantisBT release honour the parameters, both sources overlap; the
 * union by id keeps the result free of duplicates either way.
 */
export function collectVersions(input: VersionOptions & {
  own: MantisVersion[];
  projects: RawProject[];
  projectId: number;
}): MantisVersion[] {
  const { own, projects, projectId, obsolete = false, inherit = false } = input;
  const versionsById = new Map(projects.map(p => [p.id, p.versions ?? []]));
  const versionsOf = (id: number) => versionsById.get(id) ?? [];

  const parentVersions = ancestorIds(projects, projectId).flatMap(versionsOf);
  const parentIds = new Set(parentVersions.map(version => version.id));

  const byId = new Map<number, MantisVersion>();
  for (const version of [own, versionsOf(projectId), inherit ? parentVersions : []].flat()) {
    if (byId.has(version.id)) continue;
    if (!inherit && parentIds.has(version.id)) continue;
    if (!obsolete && version.obsolete) continue;
    byId.set(version.id, normalizeVersion(version));
  }

  return [...byId.values()].sort((a, b) => timeOf(b) - timeOf(a));
}

/**
 * Versions of one project. Without obsolete/inherit the /versions endpoint is
 * accurate on its own; otherwise GET /projects fills in what it drops.
 */
export async function fetchProjectVersions(
  client: MantisClient,
  projectId: number,
  { obsolete = false, inherit = false }: VersionOptions = {},
): Promise<MantisVersion[]> {
  const params: Record<string, number> = {};
  if (obsolete) params.obsolete = 1;
  if (inherit) params.inherit = 1;
  const ownRequest = client.get<{ versions?: MantisVersion[] }>(`projects/${projectId}/versions`, params);

  if (!obsolete && !inherit) return (await ownRequest).versions ?? [];

  const [ownResult, projectsResult] = await Promise.all([
    ownRequest,
    client.get<{ projects?: RawProject[] }>('projects'),
  ]);
  return collectVersions({
    own: ownResult.versions ?? [],
    projects: projectsResult.projects ?? [],
    projectId,
    obsolete,
    inherit,
  });
}
