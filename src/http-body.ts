import type { IncomingMessage, ServerResponse } from 'node:http';

// Default upper bound for a POST /mcp body (#8624). Generous because
// upload_file sends files as Base64 in `content`, a third larger than the
// file itself.
export const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;

/**
 * MCP_HTTP_MAX_BODY_SIZE in bytes (#8631); the default when unset. Anything
 * but a positive whole number throws — silently falling back to the default
 * would hide the typo until an upload fails. Called in HTTP mode only, so a
 * stray value never stops the stdio server.
 */
export function parseMaxBodySize(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) return MAX_REQUEST_BODY_BYTES;
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error(`MCP_HTTP_MAX_BODY_SIZE must be a positive whole number of bytes, got "${raw}".`);
  }
  return bytes;
}

/**
 * Reads the request body, at most `limit` bytes. A larger body — announced
 * by Content-Length or found while reading — gets 413 and the connection is
 * closed. Resolves undefined then, or when the client aborts; the caller must
 * not respond in either case.
 *
 * The SDK transport has its own limit (maxRequestBodySize), but it reads the
 * body inside handleRequest — in runHttp that runs in the serialized request
 * queue, where one slow upload would stall every other request. Reading here,
 * before the queue, avoids that; the 413 matches the SDK's JSON-RPC error.
 */
export function readBody(
  req: IncomingMessage,
  res: ServerResponse,
  limit: number,
): Promise<Buffer | undefined> {
  return new Promise(resolve => {
    const tooLarge = () => {
      res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: `Request body exceeds ${limit} bytes` },
        id: null,
      }));
      resolve(undefined);
    };
    if (Number(req.headers['content-length']) > limit) {
      tooLarge();
      return;
    }
    let chunks: Buffer[] | undefined = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      if (!chunks) return; // over the limit: drop the rest until the socket closes
      size += chunk.length;
      if (size <= limit) {
        chunks.push(chunk);
        return;
      }
      chunks = undefined;
      tooLarge();
    });
    req.on('end', () => resolve(chunks && Buffer.concat(chunks)));
    req.on('error', () => resolve(undefined));
  });
}
