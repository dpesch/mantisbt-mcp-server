/**
 * Token benchmark (#8492): how large are the tool responses that land in the
 * model's context for typical tasks — with and without the server doing the work?
 *
 * Calls the real tool handlers against a live MantisBT and measures the
 * response text. Tokens are estimated as characters / 4.
 *
 * Usage:
 *   MANTIS_BASE_URL=… MANTIS_API_KEY=… \
 *   BENCHMARK_PROJECT_ID=12 BENCHMARK_ISSUE_IDS=101,102,103,104,105 \
 *   npm run benchmark
 *
 * Credentials may also come from .env.local (same as the server).
 */
import { MantisClient } from '../src/client.js';
import { getConfig } from '../src/config.js';
import { MetadataCache } from '../src/cache.js';
import { VersionHintService } from '../src/version-hint.js';
import { registerAllTools } from '../src/tools/index.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
type Tool = { schema: { parse: (args: unknown) => Record<string, unknown> }; handler: Handler };

const projectId = Number(process.env['BENCHMARK_PROJECT_ID']);
const issueIds = (process.env['BENCHMARK_ISSUE_IDS'] ?? '').split(',').map(Number).filter(n => n > 0);
if (!projectId || issueIds.length === 0) {
  console.error('Set BENCHMARK_PROJECT_ID and BENCHMARK_ISSUE_IDS (comma-separated, e.g. five IDs).');
  process.exit(1);
}

const config = await getConfig();
const client = new MantisClient(config.baseUrl, config.apiKey, config.useIndexPhp);
const tools = new Map<string, Tool>();
const server = {
  registerTool: (name: string, def: { inputSchema: Tool['schema'] }, handler: Handler) =>
    tools.set(name, { schema: def.inputSchema, handler }),
};
registerAllTools(server as never, {
  client,
  cache: new MetadataCache(join(tmpdir(), 'mantisbt-mcp-benchmark'), 3600),
  versionHint: new VersionHintService(),
  version: 'benchmark',
});

/** Calls a tool like an MCP client would (schema defaults and coercion applied) and returns the response text. */
async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = tools.get(name)!;
  const result = await tool.handler(tool.schema.parse(args));
  if (result.isError) throw new Error(`${name}: ${result.content[0]?.text}`);
  return result.content[0]!.text;
}

const size = async (name: string, args: Record<string, unknown>) => (await call(name, args)).length;

/**
 * Sum of all list_issues pages — what a client pays to see every issue.
 * With client-side filters list_issues scans at most 500 issues, so on large
 * projects this "before" value is understated.
 */
async function allPages(args: Record<string, unknown>): Promise<number> {
  const PAGE_SIZE = 50;
  let total = 0;
  for (let page = 1; ; page++) {
    const text = await call('list_issues', { ...args, page, page_size: PAGE_SIZE });
    total += text.length;
    if ((JSON.parse(text) as { issues?: unknown[] }).issues?.length !== PAGE_SIZE) return total;
  }
}

const tokens = (chars: number) => Math.round(chars / 4).toLocaleString('en-US');

const tasks: Array<{ task: string; before: [string, () => Promise<number>]; after: [string, () => Promise<number>] }> = [
  {
    task: `Status overview of project ${projectId}`,
    before: ['list_issues, all pages', () => allPages({ project_id: projectId })],
    after: ['list_issues + group_by: "status"', () => size('list_issues', { project_id: projectId, group_by: 'status' })],
  },
  {
    task: `Open issues per handler in project ${projectId}`,
    before: ['list_issues status "open" + select, all pages', () => allPages({ project_id: projectId, status: 'open', select: 'id,handler,status' })],
    after: ['list_issues + group_by: "handler"', () => size('list_issues', { project_id: projectId, status: 'open', group_by: 'handler' })],
  },
  {
    task: `${issueIds.length} issues with selected fields`,
    before: ['get_issue ids, no select', () => size('get_issue', { ids: issueIds })],
    after: ['get_issue ids + select', () => size('get_issue', { ids: issueIds, select: 'id,summary,status,handler,priority' })],
  },
];

console.log('| Task | Before | Tokens | After | Tokens | Saved |');
console.log('|---|---|---:|---|---:|---:|');
for (const { task, before, after } of tasks) {
  const b = await before[1]();
  const a = await after[1]();
  // Rounded down so a saving never shows as 100 % when it is not.
  const saved = `${(Math.floor((1 - a / b) * 1000) / 10).toFixed(1)} %`;
  console.log(`| ${task} | ${before[0]} | ${tokens(b)} | ${after[0]} | ${tokens(a)} | ${saved} |`);
}
console.log('\nTokens estimated as characters / 4.');
