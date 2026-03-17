#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { getConfig } from './config.js';
import { MantisClient } from './client.js';
import { VersionHintService, setGlobalVersionHint } from './version-hint.js';
import { MetadataCache } from './cache.js';

import { registerIssueTools } from './tools/issues.js';
import { registerNoteTools } from './tools/notes.js';
import { registerFileTools } from './tools/files.js';
import { registerRelationshipTools } from './tools/relationships.js';
import { registerMonitorTools } from './tools/monitors.js';
import { registerProjectTools } from './tools/projects.js';
import { registerUserTools } from './tools/users.js';
import { registerFilterTools } from './tools/filters.js';
import { registerConfigTools } from './tools/config.js';
import { registerMetadataTools } from './tools/metadata.js';
import { registerTagTools } from './tools/tags.js';
import { registerVersionTools } from './tools/version.js';

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

async function createMcpServer(): Promise<McpServer> {
  const config = await getConfig();

  const versionHint = new VersionHintService();
  setGlobalVersionHint(versionHint);
  const client = new MantisClient(
    config.baseUrl,
    config.apiKey,
    (response) => versionHint.onSuccessfulResponse(response),
  );
  const cache = new MetadataCache(config.cacheDir, config.cacheTtl);

  const server = new McpServer({
    name: 'mantisbt-mcp-server',
    version,
  });

  registerIssueTools(server, client, cache);
  registerNoteTools(server, client);
  registerFileTools(server, client);
  registerRelationshipTools(server, client);
  registerMonitorTools(server, client);
  registerProjectTools(server, client);
  registerUserTools(server, client);
  registerFilterTools(server, client);
  registerConfigTools(server, client, cache);
  registerMetadataTools(server, client, cache);
  registerTagTools(server, client);
  registerVersionTools(server, client, versionHint, version);

  // Optional: Semantic search module
  if (config.search.enabled) {
    const { initializeSearchModule } = await import('./search/index.js');
    await initializeSearchModule(server, client, config.search);
  }

  return server;
}

// ---------------------------------------------------------------------------
// Transport: stdio (default) or HTTP
// ---------------------------------------------------------------------------

async function runStdio(): Promise<void> {
  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`MantisBT MCP Server v${version} running (stdio)`);
}

async function runHttp(): Promise<void> {
  const server = await createMcpServer();
  const port = parseInt(process.env.PORT ?? '3000', 10);

  const httpServer = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });
          res.on('close', () => transport.close());
          await server.connect(transport);
          await transport.handleRequest(req, res, body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad Request' }));
        }
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'mantisbt-mcp-server', version }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(port, () => {
    console.error(`MantisBT MCP Server v${version} running on http://localhost:${port}/mcp`);
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
