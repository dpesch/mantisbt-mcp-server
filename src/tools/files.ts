import { readFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
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

export function registerFileTools(server: McpServer, client: MantisClient, uploadDir?: string): void {
  const normalizedUploadDir = uploadDir ? resolve(uploadDir) + sep : undefined;

  // ---------------------------------------------------------------------------
  // list_issue_files
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_issue_files',
    {
      title: 'List Issue File Attachments',
      description: `List all file attachments of a MantisBT issue. Returns an array of attachment objects, each containing id, filename, size in bytes, content_type, and download_url. Returns an empty array if the issue has no attachments.

Use this tool when you need to inspect or enumerate files attached to an issue. To add a new attachment, use upload_file instead. To retrieve full issue details that include attachments alongside other fields, use get_issue instead.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
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
      description: `Upload a file as an attachment to a MantisBT issue. Adds the file to the issue without modifying any issue fields or status. Returns the created attachment metadata on success.

Provide exactly one of the two input modes:
- file_path (preferred): absolute path to a local file — use this whenever the file exists on disk; the server reads and encodes it automatically; filename is derived from the path
- content: Base64-encoded file content — only use this when the file is not accessible via a path (e.g. in-memory data); filename must be supplied explicitly via the filename parameter

The optional content_type sets the MIME type (e.g. "image/png"); defaults to "application/octet-stream". Use the optional description to annotate the attachment.

Use this tool to attach files such as logs, screenshots, or patches to an existing issue. To list existing attachments, use list_issue_files. To retrieve issue details, use get_issue.`,
      inputSchema: z.object({
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
        file_path: z.string().min(1).optional().describe('Preferred: absolute path to the local file to upload — use this whenever the file exists on disk (mutually exclusive with content)'),
        content: z.string().min(1).optional().describe('Fallback: Base64-encoded file content — only use when file_path is not available (mutually exclusive with file_path)'),
        filename: z.string().min(1).optional().describe('File name for the attachment (required when using content; overrides the derived name when using file_path)'),
        content_type: z.string().optional().describe('MIME type of the file, e.g. "image/png" (default: "application/octet-stream")'),
        description: z.string().optional().describe('Optional description for the attachment'),
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

        let base64Content: string;
        let fileName: string;

        if (file_path) {
          if (normalizedUploadDir) {
            const normalizedPath = resolve(file_path);
            if (!normalizedPath.startsWith(normalizedUploadDir)) {
              return { content: [{ type: 'text', text: errorText('file_path is not allowed — access restricted to the designated upload directory') }], isError: true };
            }
          }
          const fileBuffer = await readFile(file_path);
          base64Content = fileBuffer.toString('base64');
          fileName = filename ?? basename(file_path);
        } else {
          if (!filename) {
            return { content: [{ type: 'text', text: 'Error: filename is required when using content' }], isError: true };
          }
          base64Content = content!;
          fileName = filename;
        }

        const body: Record<string, unknown> = {
          files: [{ name: fileName, type: content_type ?? 'application/octet-stream', content: base64Content }],
        };
        if (description) {
          body['description'] = description;
        }
        const result = await client.post<unknown>(`issues/${issue_id}/files`, body);
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
