// ---------------------------------------------------------------------------
// Common building blocks
// ---------------------------------------------------------------------------

export interface MantisIdName {
  id: number;
  name: string;
  label?: string;
}

export interface MantisIdLabel {
  id: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface MantisUser {
  id: number;
  name: string;
  real_name?: string;
  email?: string;
  access_level?: MantisIdLabel;
  enabled?: boolean;
}

export interface MantisProject {
  id: number;
  name: string;
  description?: string;
  status?: MantisIdName;
  enabled?: boolean;
  view_state?: MantisIdName;
  access_level?: MantisIdLabel;
  subprojects?: MantisProject[];
}

export interface MantisVersion {
  id: number;
  name: string;
  description?: string;
  released?: boolean;
  obsolete?: boolean;
  timestamp?: string;
}

export interface MantisCategory {
  id: number;
  name: string;
  project?: MantisIdName;
}

export interface MantisNote {
  id: number;
  reporter?: MantisUser;
  text: string;
  view_state?: MantisIdName;
  last_modified?: string;
  date_submitted?: string;
  note_type?: number;
  note_attr?: string;
}

export interface MantisFile {
  id: number;
  file_name: string;
  size: number;
  content_type?: string;
  date_added?: string;
  description?: string;
}

export interface MantisRelationship {
  id: number;
  issue: MantisIdName;
  type: MantisIdLabel;
}

export interface MantisFilter {
  id: number;
  owner?: MantisUser;
  project?: MantisIdName;
  is_public?: boolean;
  name: string;
  url?: string;
}

export interface MantisTag {
  id: number;
  user?: MantisUser;
  name: string;
  description?: string;
  date_created?: string;
  date_updated?: string;
}

export interface MantisIssue {
  id: number;
  summary: string;
  description?: string;
  project?: MantisIdName;
  category?: MantisIdName;
  status?: MantisIdName;
  resolution?: MantisIdName;
  priority?: MantisIdName;
  severity?: MantisIdName;
  reporter?: MantisUser;
  handler?: MantisUser;
  created_at?: string;
  updated_at?: string;
  notes?: MantisNote[];
  attachments?: MantisFile[];
  relationships?: MantisRelationship[];
  tags?: MantisIdName[];
  target_version?: MantisVersion;
  fixed_in_version?: MantisVersion;
  version?: MantisVersion;
  reproducibility?: MantisIdName;
  view_state?: MantisIdName;
  custom_fields?: Array<{ field: MantisIdName; value: string }>;
}

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

export interface MantisPaginatedIssues {
  issues: MantisIssue[];
  total_count?: number;
  page_size?: number;
  page?: number;
}
