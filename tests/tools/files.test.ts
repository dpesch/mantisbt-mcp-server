import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MantisClient } from '../../src/client.js';
import { registerFileTools } from '../../src/tools/files.js';
import { MockMcpServer, makeResponse } from '../helpers/mock-server.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// Import after mock so the mock is in place
import { readFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockServer: MockMcpServer;
let client: MantisClient;

beforeEach(() => {
  mockServer = new MockMcpServer();
  client = new MantisClient('https://mantis.example.com', 'test-token');
  registerFileTools(mockServer as never, client);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// list_issue_files
// ---------------------------------------------------------------------------

describe('list_issue_files', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('list_issue_files')).toBe(true);
  });

  it('returns an attachment array', async () => {
    const apiResponse = {
      issues: [{
        id: 42,
        attachments: [
          { id: 1, file_name: 'screenshot.png', size: 12345, content_type: 'image/png' },
        ],
      }],
    };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(apiResponse)));

    const result = await mockServer.callTool('list_issue_files', { issue_id: 42 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Array<{ file_name: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]!.file_name).toBe('screenshot.png');
  });

  it('returns an empty array when there are no attachments', async () => {
    const apiResponse = { issues: [{ id: 42 }] };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(apiResponse)));

    const result = await mockServer.callTool('list_issue_files', { issue_id: 42 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as unknown[];
    expect(parsed).toEqual([]);
  });

  it('calls the correct endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ issues: [{ id: 42 }] })));

    await mockServer.callTool('list_issue_files', { issue_id: 42 });

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('issues/42');
  });
});

// ---------------------------------------------------------------------------
// upload_file – file_path mode
// ---------------------------------------------------------------------------

describe('upload_file', () => {
  it('is registered', () => {
    expect(mockServer.hasToolRegistered('upload_file')).toBe(true);
  });

  it('reads the file and posts to the correct endpoint', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('file content') as never);
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5, file_name: 'report.pdf' })));

    await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/report.pdf' });

    expect(readFile).toHaveBeenCalledWith('/tmp/report.pdf');
    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('issues/42/files');
  });

  it('sends a POST request with FormData', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('content') as never);
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/test.txt' });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
  });

  it('does not set Content-Type header (set automatically by fetch)', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('content') as never);
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/test.txt' });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('appends description when provided', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('content') as never);
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/test.txt', description: 'My attachment' });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const formData = options.body as FormData;
    expect(formData.get('description')).toBe('My attachment');
  });

  it('returns the API response', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('content') as never);
    const apiResponse = { id: 5, file_name: 'report.pdf', size: 7 };
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify(apiResponse)));

    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/report.pdf' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as { file_name: string };
    expect(parsed.file_name).toBe('report.pdf');
  });

  it('returns isError when the file is not found', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file or directory, open '/tmp/missing.txt'") as never);

    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/missing.txt' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });

  it('returns isError on API error', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('content') as never);
    vi.mocked(fetch).mockResolvedValue(makeResponse(403, JSON.stringify({ message: 'Forbidden' })));

    const result = await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/test.txt' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });

  it('overrides the filename when filename is provided', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('content') as never);
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 5 })));

    await mockServer.callTool('upload_file', { issue_id: 42, file_path: '/tmp/report.pdf', filename: 'custom-name.pdf' });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const formData = options.body as FormData;
    const fileEntry = formData.get('file') as File;
    expect(fileEntry.name).toBe('custom-name.pdf');
  });
});

// ---------------------------------------------------------------------------
// upload_file – Base64 mode
// ---------------------------------------------------------------------------

describe('upload_file (Base64)', () => {
  it('decodes Base64 content and uploads it', async () => {
    const originalContent = 'Hello, World!';
    const base64Content = Buffer.from(originalContent).toString('base64');
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 7, file_name: 'hello.txt' })));

    const result = await mockServer.callTool('upload_file', {
      issue_id: 42,
      content: base64Content,
      filename: 'hello.txt',
    });

    expect(result.isError).toBeUndefined();
    expect(readFile).not.toHaveBeenCalled();
    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('issues/42/files');
  });

  it('uses the provided filename', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 7 })));

    await mockServer.callTool('upload_file', {
      issue_id: 42,
      content: Buffer.from('data').toString('base64'),
      filename: 'export.csv',
    });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const formData = options.body as FormData;
    const fileEntry = formData.get('file') as File;
    expect(fileEntry.name).toBe('export.csv');
  });

  it('sets the content_type when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200, JSON.stringify({ id: 7 })));

    await mockServer.callTool('upload_file', {
      issue_id: 42,
      content: Buffer.from('data').toString('base64'),
      filename: 'image.png',
      content_type: 'image/png',
    });

    const options = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const formData = options.body as FormData;
    const fileEntry = formData.get('file') as File;
    expect(fileEntry.type).toBe('image/png');
  });

  it('returns isError when neither file_path nor content is provided', async () => {
    const result = await mockServer.callTool('upload_file', { issue_id: 42 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Either file_path or content');
  });

  it('returns isError when both file_path and content are provided', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('x') as never);

    const result = await mockServer.callTool('upload_file', {
      issue_id: 42,
      file_path: '/tmp/test.txt',
      content: Buffer.from('x').toString('base64'),
      filename: 'test.txt',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Only one of');
  });

  it('returns isError when content is provided without filename', async () => {
    const result = await mockServer.callTool('upload_file', {
      issue_id: 42,
      content: Buffer.from('data').toString('base64'),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('filename is required');
  });

  it('returns isError on API error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(500, JSON.stringify({ message: 'Internal Server Error' })));

    const result = await mockServer.callTool('upload_file', {
      issue_id: 42,
      content: Buffer.from('data').toString('base64'),
      filename: 'test.txt',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Error:');
  });
});
