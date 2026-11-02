import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { coerceBool } from '../coerce.js';
import { MantisClient } from '../client.js';
import type { MantisVersion } from '../types.js';
import { getVersionHint } from '../version-hint.js';
import { MetadataCache } from '../cache.js';
import { deprecationNote } from '../deprecation.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

/** Drops undefined values so PATCH only touches the fields the caller set. */
function definedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

const PERMISSION_NOTE = 'Requires the manage_project_threshold access level in the project (MantisBT default: manager).';

const OWNING_PROJECT_NOTE = 'The version must belong to project_id itself: versions inherited from a parent project can only be changed via the parent\'s project_id (otherwise MantisBT answers "Version not found"). get_project with include: ["versions"] and without inherit lists the project\'s own versions.';

const projectIdSchema = z.coerce.number().int().positive().describe('Numeric ID of the project the version belongs to — use list_projects to discover project IDs');
const versionIdSchema = z.coerce.number().int().positive().describe('Numeric version ID — use get_project with include: ["versions"] to discover version IDs');
const timestampSchema = z.string().min(1).describe('Version date as ISO 8601 string, e.g. "2026-09-27" or "2026-09-27T10:00:00+02:00". Determines the order in roadmap and changelog.');
const boolFlag = z.preprocess(coerceBool, z.boolean());

export function registerProjectVersionTools(server: McpServer, client: MantisClient, cache?: MetadataCache): void {

  // A failing cache update must never turn a successful API write into an error.
  async function patchCachedVersions(mutate: (projectId: number, versions: MantisVersion[]) => MantisVersion[]): Promise<void> {
    try {
      await cache?.patchVersions(mutate);
    } catch {
      // Cache is a best-effort mirror; sync_metadata repairs it
    }
  }

  async function createVersion(projectId: number, fields: Record<string, unknown>): Promise<MantisVersion> {
    const result = await client.post<{ version: MantisVersion }>(`projects/${projectId}/versions`, definedFields(fields));
    // Only the owning project gets the new entry — whether subprojects inherit it depends on server config
    await patchCachedVersions((pid, versions) => (pid === projectId ? [...versions, result.version] : versions));
    return result.version;
  }

  async function updateVersion(projectId: number, versionId: number, fields: Record<string, unknown>): Promise<MantisVersion> {
    const result = await client.patch<{ version: MantisVersion }>(`projects/${projectId}/versions/${versionId}`, definedFields(fields));
    // Version IDs are global, so inherited copies in subprojects are updated as well
    await patchCachedVersions((_pid, versions) => versions.map((v) => (v.id === versionId ? result.version : v)));
    return result.version;
  }

  /**
   * Creates the follow-up version after a release. A failure must not hide the
   * release that already succeeded, so it is reported as next_version_error.
   */
  async function createFollowUpVersion(
    projectId: number,
    name: string,
  ): Promise<{ next_version: MantisVersion } | { next_version_error: string }> {
    try {
      return { next_version: await createVersion(projectId, { name }) };
    } catch (error) {
      return { next_version_error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ---------------------------------------------------------------------------
  // create_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'create_version',
    {
      title: 'Create Version',
      description: `Create a new version in a MantisBT project. Returns the created version object (id, name, description, released, obsolete, timestamp).

Version names must be unique within the project. Without timestamp, MantisBT uses the current date.

${PERMISSION_NOTE}`,
      inputSchema: z.object({
        project_id: projectIdSchema,
        name: z.string().trim().min(1).describe('Version name, e.g. "1.2.0"'),
        description: z.string().optional().describe('Optional version description'),
        released: boolFlag.optional().describe('Mark the version as released. MantisBT default: false'),
        obsolete: boolFlag.optional().describe('Mark the version as obsolete. MantisBT default: false'),
        timestamp: timestampSchema.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ project_id, ...fields }) => {
      try {
        const created = await createVersion(project_id, fields);
        return {
          content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // update_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'update_version',
    {
      title: 'Update Version',
      description: `Update an existing version of a MantisBT project. Only the fields you pass are changed. Returns the updated version object.

Renaming a version also rewrites the version, target_version and fixed_in_version fields of all issues that reference it (including subprojects if versions are inherited).

Setting released=true does not change the version date — pass timestamp as well (e.g. the release date).

To release a version: released=true, timestamp=<release date>, and optionally next_version=<name> to create the follow-up version in the same call. With next_version the response is { version: <updated>, next_version: <created> } — or next_version_error: <message> if creating the follow-up failed (the update itself stays in effect). Without next_version the response is the updated version object.

${OWNING_PROJECT_NOTE}

${PERMISSION_NOTE}`,
      inputSchema: z.object({
        project_id: projectIdSchema,
        version_id: versionIdSchema,
        name: z.string().trim().min(1).optional().describe('New version name (must be unique within the project)'),
        description: z.string().optional().describe('New version description'),
        released: boolFlag.optional().describe('Released flag'),
        obsolete: boolFlag.optional().describe('Obsolete flag'),
        timestamp: timestampSchema.optional(),
        next_version: z.string().trim().min(1).optional().describe('Only with released=true: name of a follow-up version to create as unreleased placeholder, e.g. "1.2.1". Used as-is — no automatic numbering.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ project_id, version_id, next_version, ...fields }) => {
      if (Object.keys(definedFields(fields)).length === 0) {
        return {
          content: [{ type: 'text', text: errorText('No fields to update — pass at least one of name, description, released, obsolete, timestamp.') }],
          isError: true,
        };
      }
      if (next_version !== undefined && fields.released !== true) {
        return {
          content: [{ type: 'text', text: errorText('next_version is only allowed together with released=true.') }],
          isError: true,
        };
      }
      let updated: MantisVersion;
      try {
        updated = await updateVersion(project_id, version_id, fields);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
      if (next_version === undefined) {
        return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
      }
      const result = { version: updated, ...(await createFollowUpVersion(project_id, next_version)) };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ---------------------------------------------------------------------------
  // release_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'release_version',
    {
      title: 'Release Version',
      description: `${deprecationNote('release_version', 'update_version with released=true, timestamp and (optionally) next_version')}

Mark a version as released and set its date (default: now). Optionally create a follow-up version in the same step.

The follow-up version is only created when next_version is given; its name is used as-is — no automatic numbering.

Returns { released: <version> } plus either next_version: <version> or next_version_error: <message>. The two steps are separate API calls: if creating the follow-up version fails, the release itself stays in effect and the error is reported in next_version_error.

${OWNING_PROJECT_NOTE}

${PERMISSION_NOTE}`,
      inputSchema: z.object({
        project_id: projectIdSchema,
        version_id: versionIdSchema,
        timestamp: timestampSchema.optional().describe('Release date as ISO 8601 string. Default: now.'),
        next_version: z.string().trim().min(1).optional().describe('Name of a follow-up version to create as unreleased placeholder, e.g. "1.2.1". Omit to only release.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ project_id, version_id, timestamp, next_version }) => {
      let released: MantisVersion;
      try {
        released = await updateVersion(project_id, version_id, {
          released: true,
          timestamp: timestamp ?? new Date().toISOString(),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }

      const result = {
        released,
        ...(next_version !== undefined ? await createFollowUpVersion(project_id, next_version) : {}),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ---------------------------------------------------------------------------
  // delete_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'delete_version',
    {
      title: 'Delete Version',
      description: `Permanently delete a version of a MantisBT project. This action is irreversible.

MantisBT clears the version, target_version and fixed_in_version fields of all issues that reference the deleted version (including subprojects if versions are inherited). To retire a version without touching issues, set obsolete=true via update_version instead.

${OWNING_PROJECT_NOTE}

${PERMISSION_NOTE}`,
      inputSchema: z.object({
        project_id: projectIdSchema,
        version_id: versionIdSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ project_id, version_id }) => {
      try {
        await client.delete<unknown>(`projects/${project_id}/versions/${version_id}`);
        await patchCachedVersions((_pid, versions) => versions.filter((v) => v.id !== version_id));
        return {
          content: [{ type: 'text', text: `Version ${version_id} deleted successfully.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
