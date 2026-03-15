// ---------------------------------------------------------------------------
// Relationship type IDs
// ---------------------------------------------------------------------------
// Note: the MantisBT REST API only accepts numeric type IDs, not string names.

export const RELATIONSHIP_TYPES = {
  DUPLICATE_OF: 0,
  RELATED_TO: 1,
  PARENT_OF: 2,   // "depends on" — this issue depends on the target
  CHILD_OF: 3,    // "blocks" — this issue blocks the target
  HAS_DUPLICATE: 4,
} as const;

export type RelationshipTypeId = (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES];

// ---------------------------------------------------------------------------
// Status names (internal English names used in API calls)
// ---------------------------------------------------------------------------

export const STATUS_NAMES = [
  'new',
  'feedback',
  'acknowledged',
  'confirmed',
  'assigned',
  'resolved',
  'closed',
] as const;

export type StatusName = (typeof STATUS_NAMES)[number];
