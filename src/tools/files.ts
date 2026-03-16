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
      description: `Upload a file as an attachment to a MantisBT issue via multipart/form-data.

Two input modes (exactly one must be provided):
- file_path: absolute path to a local file — filename is derived from the path automatically
- content: Base64-encoded file content — filename must be supplied explicitly via the filename parameter

The optional content_type parameter sets the MIME type (e.g. "image/png"). If omitted, "application/octet-stream" is used.`,
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric issue ID'),
        file_path: z.string().min(1).optional().describe('Absolute path to the local file to upload (mutually exclusive with content)'),
        content: z.string().min(1).optional().describe('Base64-encoded file content (mutually exclusive with file_path)'),
        filename: z.string().min(1).optional().describe('File name for the attachment (required when using content; overrides the derived name when using file_path)'),
        content_type: z.string().optional().describe('MIME type of the file, e.g. "image/png" (default: "application/octet-stream")'),
        description: z.string().optional().describe('Optional description for the attachment'),
      }).refine(d => !!(d.file_path ?? d.content), {
        message: 'Either file_path or content must be provided',
      }).refine(d => !(d.file_path && d.content), {
        message: 'Only one of file_path or content may be provided',
      }).refine(d => !d.content || !!d.filename, {
        message: 'filename is required when using content',
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ issue_id, file_path, content, filename, content_type, description }) => {
      try {
        if (!file_path && !content) {
          return { content: [{ type: 'text', text: 'Error: Either file_path or content must be provided' }], isError: true };
        }
        if (file_path && content) {
          return { content: [{ type: 'text', text: 'Error: Only one of file_path or content may be provided' }], isError: true };
        }

        let fileBuffer: Buffer;
        let fileName: string;

        if (file_path) {
          fileBuffer = await readFile(file_path);
          fileName = filename ?? basename(file_path);
        } else {
          if (!filename) {
            return { content: [{ type: 'text', text: 'Error: filename is required when using content' }], isError: true };
          }
          fileBuffer = Buffer.from(content!, 'base64');
          fileName = filename;
        }

        const blob = new Blob([new Uint8Array(fileBuffer)], { type: content_type ?? 'application/octet-stream' });
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
