import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import { VersionHintService, parseVersion, compareVersions } from '../version-hint.js';

export function registerVersionTools(server: McpServer, client: MantisClient, versionHint: VersionHintService, mcpVersion: string): void {

  // ---------------------------------------------------------------------------
  // get_mcp_version
  // ---------------------------------------------------------------------------

  server.registerTool(
    'get_mcp_version',
    {
      title: 'Get MCP Server Version',
      description: 'Returns the version of this mantisbt-mcp-server instance.',
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
      description: `Returns the version of the connected MantisBT installation and optionally compares it against the latest official release on GitHub.

The version is read from the X-Mantis-Version response header sent by every API call.
The GitHub comparison requires an outbound HTTPS request to the GitHub API.`,
      inputSchema: z.object({
        check_latest: z.boolean().default(true).describe(
          'Whether to fetch the latest release from GitHub and compare (default: true)'
        ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ check_latest }) => {
      try {
        const installedRaw = await client.getVersion();
        const result: Record<string, unknown> = { installed_version: installedRaw };

        if (check_latest) {
          versionHint.triggerLatestVersionFetch();
          const latestRaw = await versionHint.waitForLatestVersion(5000);

          result.latest_version = latestRaw;

          if (latestRaw === null) {
            result.status = 'unknown';
            result.github_note = 'Could not fetch latest version from GitHub (timeout or network error).';
          } else {
            const installed = parseVersion(installedRaw);
            const latest = parseVersion(latestRaw);
            if (installed && latest) {
              const cmp = compareVersions(installed, latest);
              result.status = cmp === 0
                ? 'up-to-date'
                : cmp > 0
                  ? 'newer-than-release'
                  : 'update-available';
            } else {
              result.status = 'unknown';
            }
          }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
