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

// MantisBT default status ID for "resolved". Issues with status.id strictly
// below this value are considered open (new/feedback/acknowledged/confirmed/assigned).
export const MANTIS_RESOLVED_STATUS_ID = 80;

// ---------------------------------------------------------------------------
// Issue enum config option names
// ---------------------------------------------------------------------------

export const ISSUE_ENUM_OPTIONS = [
  'severity_enum_string',
  'status_enum_string',
  'priority_enum_string',
  'resolution_enum_string',
  'reproducibility_enum_string',
] as const;

export type IssueEnumOption = (typeof ISSUE_ENUM_OPTIONS)[number];

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
