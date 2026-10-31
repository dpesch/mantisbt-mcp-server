/** Major version in which deprecated tools are removed (see versioning rules in CLAUDE.md). */
export const REMOVAL_VERSION = '2.0.0';

/**
 * First line of the description of a deprecated tool. Keeping the wording in
 * one place keeps README, CHANGELOG and tests consistent.
 */
export function deprecationNote(tool: string, replacement: string): string {
  return `Deprecated: use ${replacement} instead — ${tool} will be removed in ${REMOVAL_VERSION}.`;
}
