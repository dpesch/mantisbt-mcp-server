/**
 * Keyword highlighting utilities for search_issues results.
 *
 * Note: highlights are keyword-based (lexical), not semantic.
 * A result may have no highlighted terms even if it is semantically relevant.
 */

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function combinedPattern(terms: string[], flags: string): RegExp {
  return new RegExp(`\\b(${terms.map(escapeRegex).join('|')})\\b`, flags);
}

/**
 * Extracts meaningful search terms from a query string.
 * Sorted longest-first to prevent shorter terms from matching inside
 * already-bolded longer ones during sequential replacement.
 */
export function extractTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const raw of query.trim().split(/\s+/)) {
    if (raw.length < 3) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      terms.push(raw);
    }
  }

  terms.sort((a, b) => b.length - a.length);
  return terms;
}

export function highlightText(text: string, terms: string[]): string {
  if (!terms.length) return text;
  return text.replace(combinedPattern(terms, 'gi'), '**$1**');
}

export function hasTermMatch(text: string, terms: string[]): boolean {
  if (!terms.length) return false;
  return combinedPattern(terms, 'i').test(text);
}

/**
 * Returns a highlighted snippet centered around the first term match.
 * Falls back to first `contextChars` chars when no term matches.
 */
export function extractSnippet(text: string, terms: string[], contextChars = 300): string {
  if (text.length <= contextChars) {
    return highlightText(text, terms);
  }

  const match = terms.length > 0 ? text.match(combinedPattern(terms, 'i')) : null;
  const matchIndex = match?.index ?? -1;

  if (matchIndex === -1) {
    return text.slice(0, contextChars) + '…';
  }

  const half = Math.floor(contextChars / 2);
  const start = Math.max(0, matchIndex - half);
  const end = Math.min(text.length, start + contextChars);
  const snippet = text.slice(start, end);

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + highlightText(snippet, terms) + suffix;
}
