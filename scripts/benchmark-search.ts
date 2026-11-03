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
 * Exact-first (#8545): for identifier queries (ident, and compound — a rare
 * identifier joined by - . : or / with a digit, such as CVE-2026-1234 or
 * 7.0.0-1014-azure) every issue that contains the identifier should rank
 * before the first one that does not. A query passes if the top 10 start with
 * all of its exact hits (or consist of exact hits only, when there are more
 * than 10). "Contains" uses the search's own definition (wholeIdentifier),
 * but scans every issue text instead of the keyword index under test.
 *
 * Fixed cases from BENCHMARK_EXACT (optional): { ignore?, cases } with cases
 * an array of { query, exact?, top? } — exact: the identifier to check
 * exact-first for; top: the issue expected on rank 1. ignore lists issues left
 * out of the fixed cases' rankings, such as the ticket that quotes them all.
 * Each case prints its ranking.
 *
 * Usage:
 *   MANTIS_SEARCH_DIR=… BENCHMARK_PARAPHRASES=paraphrases.json BENCHMARK_EXACT=exact.json npm run benchmark:search
 *
 * The index must have been built by the current code (same embedding
 * signature) — otherwise the numbers say nothing about the current code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStartupConfig } from '../src/config.js';
import { Embedder } from '../src/search/embedder.js';
import { VectraStore, type VectorStoreItem } from '../src/search/store.js';
import { tokenize, wholeIdentifier } from '../src/search/lexical.js';

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
/** At most n elements, spread evenly over xs. */
const spread = <T>(xs: T[], n: number) => xs.filter((_, k) => k % Math.max(1, Math.floor(xs.length / n)) === 0).slice(0, n);
const sample = [...newer, ...spread(older, 300)];

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
queries['ident'] = spread(identifiers, 500);

// Issues that contain an identifier as a whole, memoized per identifier.
const texts = items.map(i => ({ id: i.id, text: `${i.metadata.summary}\n${i.metadata.description ?? ''}` }));
const exactSets = new Map<string, Set<number>>();
const exactHits = (identifier: string): Set<number> => {
  let hits = exactSets.get(identifier);
  if (!hits) {
    const pattern = wholeIdentifier(identifier);
    exactSets.set(identifier, (hits = new Set(texts.filter(t => pattern.test(t.text)).map(t => t.id))));
  }
  return hits;
};

// Words joined by at least one separator — candidates for compound queries.
const JOINED = /[\p{L}\p{N}_]+(?:[-.:/][\p{L}\p{N}_]+)+/gu;
const compoundFrequency = new Map<string, number>();
for (const { text } of texts) {
  for (const c of new Set(text.toLowerCase().match(JOINED) ?? [])) compoundFrequency.set(c, (compoundFrequency.get(c) ?? 0) + 1);
}
const compounds = items.flatMap(i => {
  const text = (i.metadata.description ?? '').match(JOINED)?.find(c => {
    const frequency = compoundFrequency.get(c.toLowerCase()) ?? 0;
    return /\p{N}/u.test(c) && /\p{L}/u.test(c) && c.length >= 6 && c.length <= 40 && frequency >= 2 && frequency <= 8;
  });
  return text ? [{ id: i.id, text }] : [];
});
queries['compound'] = spread(compounds, 300);
const exactTypes = ['ident', 'compound'];

type FixedCase = { query: string; exact?: string; top?: number };
const fixedFile = process.env['BENCHMARK_EXACT'];
const { ignore = [], cases: fixed = [] } = fixedFile
  ? JSON.parse(readFileSync(fixedFile, 'utf-8')) as { ignore?: number[]; cases: FixedCase[] }
  : {};

/** Do the results start with all exact hits (or consist of them, when there are more)? */
const exactFirst = (results: Array<{ id: number }>, hits: Set<number>): boolean => {
  const n = Math.min(hits.size, results.length);
  return results.slice(0, n).every(r => hits.has(r.id));
};

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
const fixedVectors = fixed.length ? await embedder.embedBatch(fixed.map(c => c.query)) : [];
const percent = (n: number, of: number) => `${(100 * n / (of || 1)).toFixed(1)} %`;

for (const hybrid of [false, true]) {
  const label = hybrid ? 'hybrid     ' : 'vector only';
  const recall: string[] = [];
  const ordered: string[] = [];
  let time = 0;
  let searches = 0;
  for (const [type, qs] of Object.entries(queries)) {
    let hits = 0;
    let first = 0;
    for (const [k, q] of qs.entries()) {
      const start = performance.now();
      const results = await store.search(vectors[type]![k]!, 10, hybrid ? q.text : undefined);
      time += performance.now() - start;
      searches++;
      if (results.some(r => r.id === q.id)) hits++;
      if (exactTypes.includes(type) && exactFirst(results, exactHits(q.text))) first++;
    }
    recall.push(`${type} ${percent(hits, qs.length)}`);
    if (exactTypes.includes(type)) ordered.push(`${type} ${percent(first, qs.length)}`);
  }
  console.log(`${label}  recall@10:   ${recall.join(' | ')}  (${(time / searches).toFixed(1)} ms/search)`);
  console.log(`${label}  exact-first: ${ordered.join(' | ')}`);

  for (const [k, c] of fixed.entries()) {
    const results = (await store.search(fixedVectors[k]!, 10 + ignore.length, hybrid ? c.query : undefined))
      .filter(r => !ignore.includes(r.id)).slice(0, 10);
    const hits = new Set([...(c.exact ? exactHits(c.exact) : [])].filter(id => !ignore.includes(id)));
    const ranking = results.map(r => (hits.has(r.id) ? `[${r.id}]` : String(r.id))).join(' ');
    const verdicts = [
      c.exact ? `exact-first ${exactFirst(results, hits) ? 'ok' : 'FAIL'} (${hits.size} hits)` : '',
      c.top ? `#${c.top} on 1 ${results[0]?.id === c.top ? 'ok' : 'FAIL'}` : '',
    ].filter(Boolean).join(', ');
    console.log(`  ${JSON.stringify(c.query.length > 40 ? c.query.slice(0, 40) + '…' : c.query)}: ${verdicts} — ${ranking}`);
  }
  console.log();
}
process.exit(0);
