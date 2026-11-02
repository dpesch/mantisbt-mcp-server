// ---------------------------------------------------------------------------
// Keyword index (BM25) for hybrid search (#8542)
//
// Embeddings capture meaning but blur exact terms: identifiers, error codes,
// version numbers. search_issues therefore fuses the vector ranking with this
// keyword ranking. Built in memory from the summaries and descriptions the
// vector index already stores — no extra API calls.
// ---------------------------------------------------------------------------

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

  constructor(documents: LexicalDocument[]) {
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
}
