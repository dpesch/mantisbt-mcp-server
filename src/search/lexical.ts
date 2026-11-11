// ---------------------------------------------------------------------------
// Keyword index (BM25) for hybrid search (#8542)
//
// Embeddings capture meaning but blur exact terms: identifiers, error codes,
// version numbers. search_issues therefore fuses the vector ranking with this
// keyword ranking. Built in memory from the summaries and descriptions the
// vector index already stores — no extra API calls.
// ---------------------------------------------------------------------------

import { escapeRegex } from './highlight.js';

export interface LexicalDocument {
  id: number;
  summary: string;
  description?: string;
}

// Standard BM25 parameters.
const K1 = 1.2;
const B = 0.75;
// A summary term counts twice: titles name what an issue is about.
const SUMMARY_WEIGHT = 2;

/** Lowercased words of letters, digits and underscores, at least 2 characters. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter(word => word.length >= 2);
}

// An identifier (#8545) found in more issues than this is no longer specific
// enough to put all of them first; the fused ranking decides instead. Keeps
// common tokens such as UTF-8 from taking over a search. The rare identifiers
// of the search benchmark occur in at most 8 issues, well below the cap.
const MAX_EXACT_MATCHES = 20;

// The query is caller input of any length, and each identifier costs a text
// check per candidate issue (#8623). These caps bound that work per query.
// Measured on 7,800 issues: real queries name at most 22 identifiers and
// check at most 2,700 texts, so neither cap changes a real search.
export const MAX_QUERY_IDENTIFIERS = 32;
export const MAX_CHECKED_TEXTS = 10_000;

// Words, or words joined by - . : / (CVE-2026-1234, 7.0.0-1014-azure).
const COMPOUND = /[\p{L}\p{N}_]+(?:[-.:/][\p{L}\p{N}_]+)*/gu;

function looksLikeIdentifier(word: string): boolean {
  return word.includes('_')                                          // MANTIS_SEARCH_DIR, _resizeTimer
    || /\p{Ll}\p{Lu}/u.test(word)                                    // ScrollViewHelper
    || (word.length >= 4 && /\p{L}/u.test(word) && /\p{N}/u.test(word)) // host01
    || /^\p{N}{5,}$/u.test(word);                                    // 202699999
}

/**
 * Identifiers in a search query: order numbers, CVEs, versions, code names.
 * Plain words, short numbers ("Android 15") and hyphenated words without
 * digits ("Play-Store-Hinweis") are none.
 */
export function identifiers(query: string): string[] {
  const found = new Map<string, string>();
  for (const match of query.match(COMPOUND) ?? []) {
    // A compound with a digit is one identifier; otherwise each word counts alone.
    const candidates = /[-.:/]/.test(match) && /\p{N}/u.test(match)
      ? [match]
      : match.split(/[-.:/]/).filter(looksLikeIdentifier);
    for (const candidate of candidates) {
      if (!found.has(candidate.toLowerCase())) found.set(candidate.toLowerCase(), candidate);
    }
  }
  return [...found.values()];
}

/**
 * Matches the identifier as a whole: not inside a longer word, and not as the
 * start or end of a longer number or version (1.15 is not in 1.15.2), while a
 * word may continue with a hyphen (ScrollViewHelper in ScrollViewHelper-Bridge).
 */
export function wholeIdentifier(identifier: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?<!\\p{N}[-.:/])${escapeRegex(identifier)}(?![\\p{L}\\p{N}_])(?![-.:/]\\p{N})`, 'iu');
}

export class LexicalIndex {
  // Postings in compressed sparse rows: the documents of term t are
  // docs[offsets[t] .. offsets[t + 1]], with their term frequencies in tfs.
  // Typed arrays keep 340,000 postings (7,700 issues) at about 7 MB instead of
  // 30 MB as one object per posting — in every server process.
  private readonly termIds = new Map<string, number>();
  private readonly offsets: Uint32Array;
  private readonly docs: Uint32Array;
  private readonly tfs: Uint16Array;
  private readonly ids: Uint32Array;
  private readonly lengths: Uint32Array;
  private readonly avgLength: number;

  constructor(private readonly documents: LexicalDocument[]) {
    this.ids = Uint32Array.from(documents, doc => doc.id);
    this.lengths = new Uint32Array(documents.length);

    const counts = documents.map((doc, index) => {
      const terms = new Map<number, number>();
      const add = (text: string | undefined, weight: number) => {
        for (const term of tokenize(text ?? '')) {
          let id = this.termIds.get(term);
          if (id === undefined) this.termIds.set(term, (id = this.termIds.size));
          terms.set(id, (terms.get(id) ?? 0) + weight);
        }
      };
      add(doc.summary, SUMMARY_WEIGHT);
      add(doc.description, 1);
      for (const tf of terms.values()) this.lengths[index]! += tf;
      return terms;
    });

    const df = new Uint32Array(this.termIds.size);
    for (const terms of counts) for (const term of terms.keys()) df[term]!++;
    this.offsets = new Uint32Array(df.length + 1);
    for (let t = 0; t < df.length; t++) this.offsets[t + 1] = this.offsets[t]! + df[t]!;

    this.docs = new Uint32Array(this.offsets[df.length]!);
    this.tfs = new Uint16Array(this.docs.length);
    const cursor = this.offsets.slice(0, df.length);
    counts.forEach((terms, doc) => {
      for (const [term, tf] of terms) {
        const at = cursor[term]!++;
        this.docs[at] = doc;
        this.tfs[at] = Math.min(tf, 0xffff);
      }
    });

    this.avgLength = this.lengths.reduce((sum, length) => sum + length, 0) / (documents.length || 1);
  }

  /** BM25 score per document id; documents without a query term are absent. */
  scores(query: string): Map<number, number> {
    const byDoc = new Map<number, number>();
    const total = this.ids.length;
    for (const word of new Set(tokenize(query))) {
      const term = this.termIds.get(word);
      if (term === undefined) continue;
      const start = this.offsets[term]!;
      const end = this.offsets[term + 1]!;
      const idf = Math.log(1 + (total - (end - start) + 0.5) / (end - start + 0.5));
      for (let at = start; at < end; at++) {
        const doc = this.docs[at]!;
        const tf = this.tfs[at]!;
        const norm = K1 * (1 - B + B * this.lengths[doc]! / this.avgLength);
        byDoc.set(doc, (byDoc.get(doc) ?? 0) + idf * tf * (K1 + 1) / (tf + norm));
      }
    }
    return new Map([...byDoc].map(([doc, score]) => [this.ids[doc]!, score]));
  }

  /**
   * Per document id, how many identifiers of the query it contains as a whole
   * (#8545); documents without one are absent. Candidates come from the
   * postings of the identifier's rarest word, the text check decides.
   *
   * The MAX_QUERY_IDENTIFIERS cheapest identifiers, until MAX_CHECKED_TEXTS
   * is spent (#8623). An identifier with more candidates than the budget left
   * could count for no issue anyway — it either exceeds MAX_EXACT_MATCHES or
   * runs out of budget — and the ones after it have at least as many.
   */
  exactMatches(query: string): Map<number, number> {
    const counts = new Map<number, number>();
    const frequency = (term: number) => this.offsets[term + 1]! - this.offsets[term]!;
    const lookups = identifiers(query).flatMap(identifier => {
      const terms = tokenize(identifier).map(word => this.termIds.get(word));
      if (terms.length === 0 || terms.some(term => term === undefined)) return [];
      const rarest = (terms as number[]).reduce((a, b) => (frequency(a) <= frequency(b) ? a : b));
      return [{ identifier, start: this.offsets[rarest]!, end: this.offsets[rarest + 1]! }];
    }).sort((a, b) => (a.end - a.start) - (b.end - b.start)).slice(0, MAX_QUERY_IDENTIFIERS);

    let budget = MAX_CHECKED_TEXTS;
    for (const { identifier, start, end } of lookups) {
      if (end - start > budget) break;
      const pattern = wholeIdentifier(identifier);
      const matches: number[] = [];
      let at = start;
      for (; at < end && matches.length <= MAX_EXACT_MATCHES; at++) {
        const doc = this.documents[this.docs[at]!]!;
        if (pattern.test(doc.summary) || pattern.test(doc.description ?? '')) matches.push(doc.id);
      }
      budget -= at - start;
      if (matches.length > MAX_EXACT_MATCHES) continue;
      for (const id of matches) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }
}
