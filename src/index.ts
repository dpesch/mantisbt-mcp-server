#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { getConfig, getStartupConfig, assertHttpAuthConfigured } from './config.js';
import { MantisClient } from './client.js';
import { VersionHintService, setGlobalVersionHint } from './version-hint.js';
import { MetadataCache } from './cache.js';

import { registerAllTools } from './tools/index.js';
import { filterToolRegistration } from './toolsets.js';
import { registerPrompts } from './prompts/index.js';
import { registerResources } from './resources/index.js';

// ---------------------------------------------------------------------------
// Read version from package.json
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
) as { version: string };
const version = packageJson.version;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function createMcpServer(transport: 'stdio' | 'http'): Promise<McpServer> {
  // Use startup config (no credentials required) so the server can connect
  // and respond to tools/list even without MANTIS_BASE_URL / MANTIS_API_KEY.
  // Credentials are resolved lazily on the first actual tool invocation.
  const startupConfig = await getStartupConfig();

  const versionHint = new VersionHintService();
  setGlobalVersionHint(versionHint);
  const client = new MantisClient(
    async () => {
      const config = await getConfig();
      return {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        useIndexPhp: config.useIndexPhp,
      };
    },
    (response) => versionHint.onSuccessfulResponse(response),
  );
  const cache = new MetadataCache(startupConfig.cacheDir, startupConfig.cacheTtl);

  const server = new McpServer({
    name: 'mantisbt-mcp-server',
    version,
  });

  // Tools register through a filter for MANTIS_TOOLSETS / MANTIS_DISABLE_DESTRUCTIVE;
  // prompts and resources use the server directly.
  const tools = filterToolRegistration(server, startupConfig);

  // Optional: Semantic search module — needs MANTIS_SEARCH_ENABLED=true and the
  // "search" tool group (skipping it avoids loading the model and the index).
  // Initialized first so get_metadata can report the index status.
  const searchIndexStatus = startupConfig.search.enabled && startupConfig.toolsets.has('search')
    ? await (await import('./search/index.js')).initializeSearchModule(tools, client, startupConfig.search)
    : undefined;

  registerAllTools(tools, {
    client,
    cache,
    versionHint,
    version,
    uploadDir: startupConfig.uploadDir,
    transport,
    searchIndexStatus,
  });
  registerPrompts(server);
  registerResources(server, client, cache, startupConfig.testEnvironment);

  return server;
}

// ---------------------------------------------------------------------------
// Transport: stdio (default) or HTTP
// ---------------------------------------------------------------------------

async function runStdio(): Promise<void> {
  const server = await createMcpServer('stdio');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`MantisBT MCP Server v${version} running (stdio)`);

  // Exit when the parent process (Claude) closes stdin. Without this, a
  // background search sync keeps the process alive after the session ends,
  // causing multiple stale instances to accumulate over time.
  process.stdin.once('close', () => process.exit(0));
}

async function runHttp(): Promise<void> {
  const startupConfig = await getStartupConfig();
  assertHttpAuthConfigured(startupConfig.httpToken);
  const server = await createMcpServer('http');
  const port = startupConfig.httpPort;

  // Serialize stateless requests: each request waits for the previous transport
  // to be fully closed before connecting a new one. Without this, concurrent
  // requests (e.g. from MCP Inspector sending resources/list + resources/read +
  // tools/list in parallel) would cause server.close() to kill the transport of
  // a still-running request, leaving those responses never sent.
  let requestQueue: Promise<void> = Promise.resolve();

  const httpServer = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      // Token is guaranteed present by assertHttpAuthConfigured() at startup.
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${startupConfig.httpToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const prev = requestQueue;
        let releaseLock!: () => void;
        requestQueue = new Promise<void>(resolve => { releaseLock = resolve; });

        void prev.then(async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: undefined,
              enableJsonResponse: true,
            });
            await server.connect(transport);
            await transport.handleRequest(req, res, body);
          } catch (err) {
            console.error('[HTTP handler error]', err instanceof Error ? err.stack : err);
            if (!res.headersSent) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Request' }));
            }
          } finally {
            await server.close();
            releaseLock();
          }
        });
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'mantisbt-mcp-server', version }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(port, startupConfig.httpHost, () => {
    console.error(`MantisBT MCP Server v${version} running on http://${startupConfig.httpHost}:${port}/mcp`);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = process.env.TRANSPORT ?? 'stdio';

if (transport === 'http') {
  runHttp().catch((err: unknown) => {
    console.error('Server startup error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  runStdio().catch((err: unknown) => {
    console.error('Server startup error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
