/**
 * Search benchmark (#8539, #8541, #8542): how often does search_issues find an
 * issue among the top 10 for a query derived from that issue?
 *
 * Reads an existing search index (never writes to it, never calls MantisBT)
 * and runs the real Embedder and VectraStore against it, once ranked by
 * vectors only and once hybrid (vectors + keyword ranking).
 *
 * Query types, built from the indexed issues:
 * - title:  the exact summary
 * - first:  the first sentence of the description
 * - deep:   a sentence from the middle of a long description (beyond ~120 words)
 * - ident:  a code-like identifier that occurs in at most 3 issues
 * - para:   hand-written paraphrases from BENCHMARK_PARAPHRASES (optional):
 *           a JSON array of [issueId, query] pairs. All other types consist of
 *           literal issue text and favour the keyword ranking; only paraphrases
 *           show whether the semantic ranking still does its job.
 *
 * Usage:
 *   MANTIS_SEARCH_DIR=… BENCHMARK_PARAPHRASES=paraphrases.json npm run benchmark:search
 *
 * The index must have been built by the current code (same embedding
 * signature) — otherwise the numbers say nothing about the current code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStartupConfig } from '../src/config.js';
import { Embedder } from '../src/search/embedder.js';
import { VectraStore, type VectorStoreItem } from '../src/search/store.js';
import { tokenize } from '../src/search/lexical.js';

type Query = { id: number; text: string };

const { search } = await getStartupConfig();
const store = new VectraStore(search.dir);
const embedder = new Embedder(search.modelName, search.numThreads);

const stored = await store.getEmbeddingSignature();
if (stored !== embedder.signature) {
  console.error(`Index in ${search.dir} was built with "${stored ?? 'no signature'}", the current code uses "${embedder.signature}".`);
  console.error('Rebuild it with the current code first (rebuild_search_index with full: true).');
  process.exit(1);
}

const items = JSON.parse(readFileSync(join(search.dir, 'vectra', 'index.json'), 'utf-8')) as VectorStoreItem[];

// --- queries ---------------------------------------------------------------

const clean = (s: string) => s.replace(/[*`#>|_[\]]/g, ' ').replace(/\s+/g, ' ').trim();
const sentences = (d = '') => d.split(/(?<=[.!?])\s|\n/).map(clean).filter(s => s.length >= 40 && s.length <= 300);
const words = (s: string) => s.split(/\s+/).length;

// All issues from 8000 on plus 300 older ones, spread evenly.
const newer = items.filter(i => i.id >= 8000);
const older = items.filter(i => i.id < 8000).sort((a, b) => a.id - b.id);
const step = Math.max(1, Math.floor(older.length / 300));
const sample = [...newer, ...older.filter((_, k) => k % step === 0).slice(0, 300)];

const queries: Record<string, Query[]> = {
  title: sample.map(i => ({ id: i.id, text: i.metadata.summary })),
  first: sample.flatMap(i => {
    const text = sentences(i.metadata.description)[0];
    return text ? [{ id: i.id, text }] : [];
  }),
  deep: items.flatMap(i => {
    const d = i.metadata.description ?? '';
    if (words(d) <= 250) return [];
    const later = sentences(d).filter(s => words(d.slice(0, d.indexOf(s.slice(0, 20)))) > 120);
    return later.length ? [{ id: i.id, text: later[Math.floor(later.length / 2)]! }] : [];
  }).slice(0, 500),
};

const documentFrequency = new Map<string, number>();
for (const i of items) {
  for (const term of new Set(tokenize(`${i.metadata.summary} ${i.metadata.description ?? ''}`))) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
}
const identifiers = items.flatMap(i => {
  const candidates = (i.metadata.description ?? '').match(/`([^`\s]{4,40})`|\b[A-Za-z]+_[A-Za-z0-9_]+\b|\b[a-z]+[A-Z][A-Za-z0-9]+\b/g) ?? [];
  const text = candidates.map(c => c.replace(/`/g, '')).find(c => {
    const terms = tokenize(c);
    return terms.length === 1 && (documentFrequency.get(terms[0]!) ?? Infinity) <= 3;
  });
  return text ? [{ id: i.id, text }] : [];
});
queries['ident'] = identifiers.filter((_, k) => k % Math.max(1, Math.floor(identifiers.length / 500)) === 0).slice(0, 500);

const paraphraseFile = process.env['BENCHMARK_PARAPHRASES'];
if (paraphraseFile) {
  const pairs = JSON.parse(readFileSync(paraphraseFile, 'utf-8')) as Array<[number, string]>;
  const known = new Set(items.map(i => i.id));
  queries['para'] = pairs.filter(([id]) => known.has(id)).map(([id, text]) => ({ id, text }));
}

console.log(`Index: ${items.length} issues, ${items.reduce((n, i) => n + 1 + (i.chunks?.length ?? 0), 0)} vectors, signature ${embedder.signature}`);
console.log(`Queries: ${Object.entries(queries).map(([type, qs]) => `${type} ${qs.length}`).join(', ')}\n`);

// --- measure ---------------------------------------------------------------

const vectors: Record<string, number[][]> = {};
for (const [type, qs] of Object.entries(queries)) vectors[type] = await embedder.embedBatch(qs.map(q => q.text));

for (const hybrid of [false, true]) {
  const cells: string[] = [];
  let time = 0;
  let searches = 0;
  for (const [type, qs] of Object.entries(queries)) {
    let hits = 0;
    for (const [k, q] of qs.entries()) {
      const start = performance.now();
      const results = await store.search(vectors[type]![k]!, 10, hybrid ? q.text : undefined);
      time += performance.now() - start;
      searches++;
      if (results.some(r => r.id === q.id)) hits++;
    }
    cells.push(`${type} ${(100 * hits / (qs.length || 1)).toFixed(1)} %`);
  }
  console.log(`${hybrid ? 'hybrid     ' : 'vector only'}  ${cells.join(' | ')}  (${(time / searches).toFixed(1)} ms/search)`);
}
process.exit(0);
