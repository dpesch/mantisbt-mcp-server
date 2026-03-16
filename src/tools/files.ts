import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MantisClient } from '../client.js';
import type { MantisFile } from '../types.js';
import { getVersionHint } from '../version-hint.js';

function errorText(msg: string): string {
  const vh = getVersionHint();
  vh?.triggerLatestVersionFetch();
  const hint = vh?.getUpdateHint();
  return hint ? `Error: ${msg}\n\n${hint}` : `Error: ${msg}`;
}

export function registerFileTools(server: McpServer, client: MantisClient): void {

  // ---------------------------------------------------------------------------
  // list_issue_files
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_issue_files',
    {
      title: 'List Issue File Attachments',
      description: 'List all file attachments of a MantisBT issue.',
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric issue ID'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ issue_id }) => {
      try {
        const result = await client.get<{ issues: Array<{ attachments?: MantisFile[] }> }>(`issues/${issue_id}`);
        const attachments = result.issues?.[0]?.attachments ?? [];
        return {
          content: [{ type: 'text', text: JSON.stringify(attachments, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // upload_file
  // ---------------------------------------------------------------------------

  server.registerTool(
    'upload_file',
    {
      title: 'Upload File Attachment',
      description: 'Upload a local file as an attachment to a MantisBT issue. Reads the file from the given path and uploads it via multipart/form-data.',
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric issue ID'),
        file_path: z.string().min(1).describe('Absolute path to the local file to upload'),
        description: z.string().optional().describe('Optional description for the attachment'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ issue_id, file_path, description }) => {
      try {
        const fileBuffer = await readFile(file_path);
        const fileName = basename(file_path);
        const blob = new Blob([new Uint8Array(fileBuffer)]);
        const formData = new FormData();
        formData.append('file', blob, fileName);
        if (description) {
          formData.append('description', description);
        }
        const result = await client.postFormData<unknown>(`issues/${issue_id}/files`, formData);
        return {
          content: [{ type: 'text', text: JSON.stringify(result ?? { success: true }, null, 2) }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: errorText(msg) }], isError: true };
      }
    }
  );
}
