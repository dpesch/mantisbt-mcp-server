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
// Relationship type name → ID mapping (string aliases accepted by add_relationship)
// ---------------------------------------------------------------------------

export const RELATIONSHIP_NAME_TO_ID: Record<string, number> = {
  'duplicate_of':  RELATIONSHIP_TYPES.DUPLICATE_OF,
  'duplicate-of':  RELATIONSHIP_TYPES.DUPLICATE_OF,
  'duplicateof':   RELATIONSHIP_TYPES.DUPLICATE_OF,
  'related_to':    RELATIONSHIP_TYPES.RELATED_TO,
  'related-to':    RELATIONSHIP_TYPES.RELATED_TO,
  'relatedto':     RELATIONSHIP_TYPES.RELATED_TO,
  'parent_of':     RELATIONSHIP_TYPES.PARENT_OF,
  'parent-of':     RELATIONSHIP_TYPES.PARENT_OF,
  'parentof':      RELATIONSHIP_TYPES.PARENT_OF,
  'depends_on':    RELATIONSHIP_TYPES.PARENT_OF,
  'depends-on':    RELATIONSHIP_TYPES.PARENT_OF,
  'dependson':     RELATIONSHIP_TYPES.PARENT_OF,
  'child_of':      RELATIONSHIP_TYPES.CHILD_OF,
  'child-of':      RELATIONSHIP_TYPES.CHILD_OF,
  'childof':       RELATIONSHIP_TYPES.CHILD_OF,
  'blocks':        RELATIONSHIP_TYPES.CHILD_OF,
  'has_duplicate': RELATIONSHIP_TYPES.HAS_DUPLICATE,
  'has-duplicate': RELATIONSHIP_TYPES.HAS_DUPLICATE,
  'hasduplicate':  RELATIONSHIP_TYPES.HAS_DUPLICATE,
};

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
