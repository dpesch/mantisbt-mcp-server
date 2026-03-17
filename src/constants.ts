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
// Canonical English enum names for standard MantisBT installations.
// Keyed by the enum group name (without _enum_string suffix).
// Used by get_issue_enums to add a canonical_name field on localized installs.
// ---------------------------------------------------------------------------

export const MANTIS_CANONICAL_ENUM_NAMES: Record<string, Record<number, string>> = {
  severity: {
    10: 'feature',
    20: 'trivial',
    30: 'text',
    40: 'tweak',
    50: 'minor',
    60: 'major',
    70: 'crash',
    80: 'block',
  },
  status: {
    10: 'new',
    20: 'feedback',
    30: 'acknowledged',
    40: 'confirmed',
    50: 'assigned',
    80: 'resolved',
    90: 'closed',
  },
  priority: {
    10: 'none',
    20: 'low',
    30: 'normal',
    40: 'high',
    50: 'urgent',
    60: 'immediate',
  },
  resolution: {
    10: 'open',
    20: 'fixed',
    30: 'reopened',
    40: 'unable to duplicate',
    50: 'not fixable',
    60: 'duplicate',
    70: 'no change required',
    80: 'suspended',
    90: 'wont fix',
  },
  reproducibility: {
    10: 'always',
    30: 'sometimes',
    50: 'random',
    70: 'have not tried',
    90: 'unable to reproduce',
    100: 'N/A',
  },
};

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
