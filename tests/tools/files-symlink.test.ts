import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { registerFileTools } from '../../src/tools/files.js';
import { MockMcpServer, makeResponse, fetchCall } from '../helpers/mock-server.js';

// #8618: MANTIS_UPLOAD_DIR must hold for the file actually read, not only for
// the path as written. Uses the real filesystem — links cannot be mocked
// meaningfully. Directory links use junctions, which Windows allows without
// admin rights; file symlinks are skipped where the OS refuses them.

let root: string;
let uploadDir: string;
let outsideDir: string;
let mockServer: MockMcpServer;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mantis-upload-'));
  uploadDir = path.join(root, 'uploads');
  outsideDir = path.join(root, 'outside');
  await mkdir(uploadDir);
  await mkdir(outsideDir);
  await writeFile(path.join(uploadDir, 'report.txt'), 'inside');
  await writeFile(path.join(outsideDir, 'secret.txt'), 'secret');

  mockServer = new MockMcpServer();
  registerFileTools(mockServer as never, new MantisClient('https://mantis.example.com', 'test-token'), uploadDir, 'http');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 }))));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});

const sentContent = (): string =>
  Buffer.from((fetchCall(0).body as { files: Array<{ content: string }> }).files[0]!.content, 'base64').toString('utf8');

async function trySymlink(target: string, linkPath: string, type?: 'junction'): Promise<boolean> {
  try {
    await symlink(target, linkPath, type);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw error;
  }
}

describe('upload_file – links inside MANTIS_UPLOAD_DIR (#8618)', () => {
  it('uploads a regular file inside the upload directory', async () => {
    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: path.join(uploadDir, 'report.txt') });

    expect(result.isError).toBeUndefined();
    expect(sentContent()).toBe('inside');
  });

  it('blocks a directory link that leads outside', async () => {
    await symlink(outsideDir, path.join(uploadDir, 'escape'), 'junction');

    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: path.join(uploadDir, 'escape', 'secret.txt') });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not allowed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks a file link that leads outside', async (ctx) => {
    if (!(await trySymlink(path.join(outsideDir, 'secret.txt'), path.join(uploadDir, 'secret.txt')))) ctx.skip();

    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: path.join(uploadDir, 'secret.txt') });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('not allowed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows a link that stays inside the upload directory', async () => {
    await mkdir(path.join(uploadDir, 'sub'));
    await writeFile(path.join(uploadDir, 'sub', 'log.txt'), 'log');
    await symlink(path.join(uploadDir, 'sub'), path.join(uploadDir, 'alias'), 'junction');

    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: path.join(uploadDir, 'alias', 'log.txt') });

    expect(result.isError).toBeUndefined();
    expect(sentContent()).toBe('log');
  });

  it('blocks a sibling directory that only shares the prefix', async () => {
    await mkdir(`${uploadDir}-evil`);
    await writeFile(path.join(`${uploadDir}-evil`, 'x.txt'), 'x');

    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: path.join(`${uploadDir}-evil`, 'x.txt') });

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
