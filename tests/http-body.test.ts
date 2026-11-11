import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MAX_REQUEST_BODY_BYTES, parseMaxBodySize, readBody } from '../src/http-body.js';

// #8624: POST /mcp read the whole body into memory, however large.

const LIMIT = 100;
let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const raw = await readBody(req, res, LIMIT);
    if (raw === undefined) return;
    res.writeHead(200);
    res.end(`got ${raw.length}`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

/** Sends the parts one by one; chunked encoding when no length is given. */
function post(parts: string[], contentLength?: number): Promise<{ status: number; connection?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const headers = contentLength === undefined ? {} : { 'Content-Length': contentLength };
    const req = request({ host: '127.0.0.1', port, method: 'POST', path: '/', headers }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, connection: res.headers.connection, body }));
    });
    req.on('error', reject);
    for (const part of parts) req.write(part);
    req.end();
  });
}

describe('readBody', () => {
  it('returns a body up to the limit', async () => {
    const result = await post(['x'.repeat(LIMIT)], LIMIT);

    expect(result).toMatchObject({ status: 200, body: `got ${LIMIT}` });
  });

  it('answers 413 when Content-Length announces more than the limit', async () => {
    const result = await post(['x'.repeat(LIMIT + 1)], LIMIT + 1);

    expect(result).toMatchObject({ status: 413, connection: 'close' });
    expect(JSON.parse(result.body)).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 }, id: null });
  });

  it('answers 413 when a body without length grows past the limit', async () => {
    const result = await post(['x'.repeat(LIMIT / 2 + 10), 'x'.repeat(LIMIT / 2 + 10)]);

    expect(result).toMatchObject({ status: 413, connection: 'close' });
  });
});

// #8631
describe('parseMaxBodySize', () => {
  it('uses 64 MB when MCP_HTTP_MAX_BODY_SIZE is unset or blank', () => {
    expect(MAX_REQUEST_BODY_BYTES).toBe(64 * 1024 * 1024);
    expect(parseMaxBodySize(undefined)).toBe(MAX_REQUEST_BODY_BYTES);
    expect(parseMaxBodySize('  ')).toBe(MAX_REQUEST_BODY_BYTES);
  });

  it('reads a number of bytes', () => {
    expect(parseMaxBodySize(' 134217728 ')).toBe(134217728);
  });

  it.each(['0', '-5', '64MB', '1.5', 'abc'])('rejects "%s"', (value) => {
    expect(() => parseMaxBodySize(value)).toThrow(/MCP_HTTP_MAX_BODY_SIZE must be a positive whole number of bytes/);
  });
});
