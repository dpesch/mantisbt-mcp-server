import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared Zod schema fragment — reuse in any tool's inputSchema
// ---------------------------------------------------------------------------

export const dateFilterSchema = {
  updated_after: z.string().optional().describe(
    'ISO-8601 timestamp — only return issues updated after this date (exclusive). Example: "2026-03-25T00:00:00Z"'
  ),
  updated_before: z.string().optional().describe(
    'ISO-8601 timestamp — only return issues updated before this date (exclusive). Example: "2026-03-28T00:00:00Z"'
  ),
  created_after: z.string().optional().describe(
    'ISO-8601 timestamp — only return issues created after this date (exclusive). Example: "2026-03-01T00:00:00Z"'
  ),
  created_before: z.string().optional().describe(
    'ISO-8601 timestamp — only return issues created before this date (exclusive). Example: "2026-03-15T00:00:00Z"'
  ),
};

export interface DateFilter {
  updated_after?: string;
  updated_before?: string;
  created_after?: string;
  created_before?: string;
}

// ---------------------------------------------------------------------------
// matchesDateFilter
// ---------------------------------------------------------------------------

/**
 * Returns true if the item's dates satisfy all active date constraints.
 * All comparisons are exclusive (strictly greater / strictly less than).
 * If a filter is set but the item's corresponding date field is absent, returns false.
 */
export function matchesDateFilter(
  item: { updated_at?: string; created_at?: string },
  filter: DateFilter,
): boolean {
  const { updated_after, updated_before, created_after, created_before } = filter;

  if (updated_after !== undefined) {
    if (!item.updated_at) return false;
    if (new Date(item.updated_at) <= new Date(updated_after)) return false;
  }

  if (updated_before !== undefined) {
    if (!item.updated_at) return false;
    if (new Date(item.updated_at) >= new Date(updated_before)) return false;
  }

  if (created_after !== undefined) {
    if (!item.created_at) return false;
    if (new Date(item.created_at) <= new Date(created_after)) return false;
  }

  if (created_before !== undefined) {
    if (!item.created_at) return false;
    if (new Date(item.created_at) >= new Date(created_before)) return false;
  }

  return true;
}

/**
 * Returns true if any date filter parameter is set.
 */
export function hasDateFilter(filter: DateFilter): boolean {
  return (
    filter.updated_after !== undefined ||
    filter.updated_before !== undefined ||
    filter.created_after !== undefined ||
    filter.created_before !== undefined
  );
}
