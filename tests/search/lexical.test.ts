import { describe, it, expect } from 'vitest';
import { LexicalIndex, tokenize } from '../../src/search/lexical.js';

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
