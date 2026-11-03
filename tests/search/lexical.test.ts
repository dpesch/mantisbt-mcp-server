import { describe, it, expect } from 'vitest';
import { LexicalIndex, identifiers, tokenize } from '../../src/search/lexical.js';

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  it('lowercases words and keeps identifiers with underscores and digits together', () => {
    expect(tokenize('MANTIS_SEARCH_DIR fehlt in Version 1.15')).toEqual(['mantis_search_dir', 'fehlt', 'in', 'version', '15']);
  });

  it('keeps German umlauts and drops single characters', () => {
    expect(tokenize('Größe ä ü x Übersicht')).toEqual(['größe', 'übersicht']);
  });
});

// ---------------------------------------------------------------------------
// identifiers (#8545)
// ---------------------------------------------------------------------------

describe('identifiers', () => {
  it('finds order numbers, CVEs, versions and code identifiers', () => {
    expect(identifiers('Auftrag 202699999 und CVE-2026-1234 seit 7.0.0-1014-azure')).toEqual(['202699999', 'CVE-2026-1234', '7.0.0-1014-azure']);
    expect(identifiers('_resizeTimer ScrollViewHelper MANTIS_SEARCH_DIR host01')).toEqual(['_resizeTimer', 'ScrollViewHelper', 'MANTIS_SEARCH_DIR', 'host01']);
  });

  it('ignores plain words, short numbers and hyphenated words without digits', () => {
    expect(identifiers('Statusleiste Farbe veraltete API Android 15 seit 2026')).toEqual([]);
    expect(identifiers('Play-Store-Hinweis für cordova-android')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LexicalIndex (BM25)
// ---------------------------------------------------------------------------

describe('LexicalIndex', () => {
  const index = new LexicalIndex([
    { id: 10, summary: 'Login fails', description: 'The login page shows an error' },
    { id: 11, summary: 'Dashboard slow', description: 'Rendering takes long; see getEmbeddingSignature' },
    { id: 12, summary: 'Export broken', description: 'The export shows an error on login' },
  ]);

  it('scores only documents that contain a query term', () => {
    const scores = index.scores('getEmbeddingSignature');

    expect([...scores.keys()]).toEqual([11]);
  });

  it('ranks a rare term above a common one', () => {
    const scores = index.scores('error dashboard');

    expect(scores.get(11)!).toBeGreaterThan(scores.get(10)!);
  });

  it('weighs a match in the summary above the same match in the description', () => {
    const scores = index.scores('login');

    expect(scores.get(10)!).toBeGreaterThan(scores.get(12)!);
  });

  it('returns no scores for a query without known terms', () => {
    expect(index.scores('nothing matches here').size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LexicalIndex.exactMatches (#8545)
// ---------------------------------------------------------------------------

describe('LexicalIndex.exactMatches', () => {
  const index = new LexicalIndex([
    { id: 1, summary: 'Schließe CVE-2026-1234 auf host01' },
    { id: 2, summary: 'Vendors', description: 'wegen CVE-2026-5678 und CVE-2026-1234x' },
    { id: 3, summary: 'Update', description: 'Paket linux-image-7.0.0-1014-azure installiert' },
    { id: 4, summary: 'Bridge', description: 'Treffer über ScrollViewHelper-Bridge' },
    { id: 5, summary: 'Version', description: 'gilt ab 1.15.2' },
    { id: 6, summary: 'Auftrag', description: 'Nummer 202699999 und CVE-2026-1234' },
  ]);

  it('counts the query identifiers each issue contains as a whole', () => {
    expect(index.exactMatches('CVE-2026-1234')).toEqual(new Map([[1, 1], [6, 1]]));
    expect(index.exactMatches('202699999 CVE-2026-1234')).toEqual(new Map([[1, 1], [6, 2]]));
  });

  it('finds an identifier inside a longer compound, but not a shorter version', () => {
    expect(index.exactMatches('7.0.0-1014-azure')).toEqual(new Map([[3, 1]]));
    expect(index.exactMatches('ScrollViewHelper')).toEqual(new Map([[4, 1]]));
    expect(index.exactMatches('v1.15')).toEqual(new Map());
  });

  it('matches case-insensitively', () => {
    expect(index.exactMatches('cve-2026-1234')).toEqual(new Map([[1, 1], [6, 1]]));
  });

  it('ignores an identifier that too many issues contain', () => {
    const common = new LexicalIndex(Array.from({ length: 30 }, (_, k) => ({ id: k, summary: `Encoding UTF-8 Fall ${k}` })));

    expect(common.exactMatches('UTF-8').size).toBe(0);
  });
});
