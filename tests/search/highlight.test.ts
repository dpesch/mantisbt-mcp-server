import { describe, it, expect } from 'vitest';
import { extractTerms, highlightText, extractSnippet } from '../../src/search/highlight.js';

// ---------------------------------------------------------------------------
// extractTerms
// ---------------------------------------------------------------------------

describe('extractTerms', () => {
  it('splits by whitespace and returns terms of length >= 3', () => {
    expect(extractTerms('login error')).toEqual(['login', 'error']);
  });

  it('filters out terms shorter than 3 characters', () => {
    expect(extractTerms('a db login')).toEqual(['login']);
  });

  it('deduplicates terms case-insensitively', () => {
    const terms = extractTerms('Login login LOGIN');
    expect(terms).toHaveLength(1);
    expect(terms[0]!.toLowerCase()).toBe('login');
  });

  it('sorts longest terms first to prevent partial-match overlap', () => {
    const terms = extractTerms('err error errors');
    expect(terms[0]).toBe('errors');
    expect(terms[1]).toBe('error');
  });

  it('returns empty array for empty query', () => {
    expect(extractTerms('')).toEqual([]);
  });

  it('returns empty array when all terms are too short', () => {
    expect(extractTerms('a ab')).toEqual([]);
  });

  it('trims whitespace', () => {
    expect(extractTerms('  login  error  ')).toEqual(['login', 'error']);
  });
});

// ---------------------------------------------------------------------------
// highlightText
// ---------------------------------------------------------------------------

describe('highlightText', () => {
  it('wraps a matching term in **bold**', () => {
    expect(highlightText('Login failed', ['login'])).toBe('**Login** failed');
  });

  it('is case-insensitive', () => {
    expect(highlightText('CRASH on startup', ['crash'])).toBe('**CRASH** on startup');
  });

  it('highlights multiple terms', () => {
    const result = highlightText('Login error occurred', ['login', 'error']);
    expect(result).toBe('**Login** **error** occurred');
  });

  it('returns original text when no terms match', () => {
    expect(highlightText('Something unrelated', ['crash'])).toBe('Something unrelated');
  });

  it('returns original text when terms array is empty', () => {
    expect(highlightText('Login failed', [])).toBe('Login failed');
  });

  it('does not match term as substring within a word (word-boundary-aware)', () => {
    // "or" should NOT match inside "error"
    expect(highlightText('error occurred', ['or'])).toBe('error occurred');
  });

  it('escapes special regex characters in terms', () => {
    // Term with special regex chars should not throw
    expect(() => highlightText('test (foo)', ['(foo)'])).not.toThrow();
  });

  it('highlights all occurrences of a term', () => {
    const result = highlightText('login and login again', ['login']);
    expect(result).toBe('**login** and **login** again');
  });
});

// ---------------------------------------------------------------------------
// extractSnippet
// ---------------------------------------------------------------------------

describe('extractSnippet', () => {
  it('returns full text highlighted when text is short', () => {
    const text = 'Login error on startup';
    const result = extractSnippet(text, ['login']);
    expect(result).toBe('**Login** error on startup');
  });

  it('returns first ~300 chars around the first match for long text', () => {
    const prefix = 'x'.repeat(200);
    const text = `${prefix} login error ${' unrelated text'.repeat(30)}`;
    const result = extractSnippet(text, ['login']);
    expect(result).toContain('**login**');
    expect(result.length).toBeLessThanOrEqual(350); // snippet + some overhead
  });

  it('centers snippet around first match', () => {
    const padding = 'word '.repeat(60); // ~300 chars before the match
    const text = `${padding}crash happens here ${'and more text '.repeat(30)}`;
    const result = extractSnippet(text, ['crash']);
    expect(result).toContain('**crash**');
  });

  it('returns first 300 chars (no highlight) when no term matches', () => {
    const text = 'a'.repeat(600);
    const result = extractSnippet(text, ['nomatch']);
    expect(result).toBe('a'.repeat(300) + '…');
  });

  it('returns full text (no truncation) when text is shorter than 300 chars and no match', () => {
    const text = 'Short text with no match';
    const result = extractSnippet(text, ['nomatch']);
    expect(result).toBe(text);
  });

  it('respects custom contextChars parameter', () => {
    const padding = 'x'.repeat(100);
    const text = `${padding} crash ${padding}`;
    const result = extractSnippet(text, ['crash'], 50);
    expect(result).toContain('**crash**');
    expect(result.length).toBeLessThanOrEqual(150);
  });
});
