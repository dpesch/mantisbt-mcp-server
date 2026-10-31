import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { coerceBool } from '../coerce.js';
import { MantisClient } from '../client.js';
import { VersionHintService, parseVersion, compareVersions } from '../version-hint.js';
import { deprecationNote } from '../deprecation.js';

export function registerVersionTools(server: McpServer, client: MantisClient, versionHint: VersionHintService, mcpVersion: string): void {

  /**
   * Installed MantisBT version (X-Mantis-Version header), optionally compared
   * with the latest MantisBT release on GitHub.
   */
  async function mantisVersionInfo(checkLatest: boolean): Promise<Record<string, unknown>> {
    // Start the GitHub lookup first so it overlaps with the MantisBT request.
    if (checkLatest) versionHint.triggerLatestVersionFetch();
    const installedRaw = await client.getVersion();
    const result: Record<string, unknown> = { installed_version: installedRaw };
    if (!checkLatest) return result;

    const latestRaw = await versionHint.waitForLatestVersion(5000);
    result.latest_version = latestRaw;
    if (latestRaw === null) {
      result.status = 'unknown';
      result.github_note = 'Could not fetch latest version from GitHub (timeout or network error).';
      return result;
    }
    const installed = parseVersion(installedRaw);
    const latest = parseVersion(latestRaw);
    if (installed && latest) {
      const cmp = compareVersions(installed, latest);
      result.status = cmp === 0 ? 'up-to-date' : cmp > 0 ? 'newer-than-release' : 'update-available';
    } else {
      result.status = 'unknown';
    }
    return result;
  }

  const checkLatestSchema = z.preprocess(coerceBool, z.boolean().default(true)).describe(
    'Whether to fetch the latest MantisBT release from GitHub and compare (default: true)'
  );

  // ---------------------------------------------------------------------------
  // get_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_version',
    {
      title: 'Get Versions',
      description: `Return the version of this mantisbt-mcp-server and of the connected MantisBT installation in one response:
{ mcp_server: { version }, mantis: { installed_version, latest_version?, status?, github_note? } }

The MantisBT version is read from the X-Mantis-Version response header. With check_latest (default: true) it is compared against the latest MantisBT release on GitHub (outbound HTTPS request, up to 5 seconds); status is "up-to-date", "update-available", "newer-than-release" or "unknown". If MantisBT cannot be reached, mantis contains "error" instead and mcp_server is still returned.`,
      inputSchema: z.object({ check_latest: checkLatestSchema }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ check_latest }) => {
      const mantis = await mantisVersionInfo(check_latest).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify({ mcp_server: { version: mcpVersion }, mantis }, null, 2) }],
      };
    },
  );

  // ---------------------------------------------------------------------------
  // get_mcp_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_mcp_version',
    {
      title: 'Get MCP Server Version',
      description: `${deprecationNote('get_mcp_version', 'get_version')}\n\nReturns the version of this mantisbt-mcp-server instance.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify({ version: mcpVersion }, null, 2) }],
    }),
  );

  // ---------------------------------------------------------------------------
  // get_mantis_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_mantis_version',
    {
      title: 'Get MantisBT Version',
      description: `${deprecationNote('get_mantis_version', 'get_version')}

Returns the version of the connected MantisBT installation and optionally compares it against the latest official release on GitHub.`,
      inputSchema: z.object({ check_latest: checkLatestSchema }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ check_latest }) => {
      try {
        return {
          content: [{ type: 'text', text: JSON.stringify(await mantisVersionInfo(check_latest), null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
