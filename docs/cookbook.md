# Cookbook

Tool-oriented recipes for the MantisBT MCP server — each recipe shows exactly which tool to call and with which parameters. For natural language prompt examples, see [examples.md](examples.md).

---

- [Discovering your instance](#discovering-your-instance)
  - [Get all projects](#get-all-projects)
  - [Discover valid enum values (severity, status, priority)](#discover-valid-enum-values-severity-status-priority)
  - [Discover valid field names for `select`](#discover-valid-field-names-for-select)
- [Issues](#issues)
  - [Fetch a single issue](#fetch-a-single-issue)
  - [Fetch multiple issues in one call](#fetch-multiple-issues-in-one-call)
  - [List issues (paginated)](#list-issues-paginated)
  - [Reduce response size with `select`](#reduce-response-size-with-select)
  - [Filter by status](#filter-by-status)
  - [Filter by assignee or reporter](#filter-by-assignee-or-reporter)
  - [Apply a saved filter](#apply-a-saved-filter)
  - [Create an issue](#create-an-issue)
  - [Close an issue (status + resolution)](#close-an-issue-status--resolution)
  - [Reassign an issue](#reassign-an-issue)
  - [Set fix version](#set-fix-version)
- [Notes](#notes)
  - [Add a public note](#add-a-public-note)
  - [Add a private note](#add-a-private-note)
  - [Delete a note](#delete-a-note)
- [File Attachments](#file-attachments)
  - [Upload a local file](#upload-a-local-file)
  - [Upload file content (base64)](#upload-file-content-base64)
  - [List attachments](#list-attachments)
- [Relationships](#relationships)
  - [Mark as duplicate](#mark-as-duplicate)
  - [Link as related](#link-as-related)
  - [Set a blocking relationship](#set-a-blocking-relationship)
  - [Remove a relationship](#remove-a-relationship)
- [Tags](#tags)
  - [Attach tags by name](#attach-tags-by-name)
  - [Detach a tag](#detach-a-tag)
- [Monitors (Watchers)](#monitors-watchers)
  - [Add a watcher](#add-a-watcher)
  - [Remove a watcher](#remove-a-watcher)
- [Semantic Search](#semantic-search)
  - [Build the initial index](#build-the-initial-index)
  - [Incremental index update](#incremental-index-update)
  - [Check index status](#check-index-status)
  - [Search by meaning](#search-by-meaning)
  - [Search with field enrichment](#search-with-field-enrichment)
- [Projects & Categories](#projects--categories)
  - [List project categories](#list-project-categories)
  - [Find a project member](#find-a-project-member)
- [Metadata](#metadata)
  - [Get a metadata summary](#get-a-metadata-summary)
  - [Get the full metadata cache](#get-the-full-metadata-cache)
- [Version & Diagnostics](#version--diagnostics)
  - [Get MCP server version](#get-mcp-server-version)
  - [Get MantisBT version](#get-mantis-version)
  - [Get the current user](#get-the-current-user)
- [Resources](#resources)
  - [Read the current user profile](#read-the-current-user-profile)
  - [Read all projects](#read-all-projects)
  - [Read a single project with all details](#read-a-single-project-with-all-details)
  - [Read issue enum values](#read-issue-enum-values)
- [Prompts](#prompts)
  - [Create a bug report](#create-a-bug-report)
  - [Create a feature request](#create-a-feature-request)
  - [Summarize an issue](#summarize-an-issue)
  - [Project status report](#project-status-report)
- [Destructive Operations](#destructive-operations)
  - [Delete an issue](#delete-an-issue)

---

## Discovering your instance

### Get all projects

Returns the full list of projects accessible with your API key.

**Tool:** `list_projects`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response:**

```json
[
  { "id": 3, "name": "Webshop", "status": { "id": 10, "name": "development" }, "enabled": true },
  { "id": 5, "name": "Backend API", "status": { "id": 10, "name": "development" }, "enabled": true }
]
```

---

### Discover valid enum values (severity, status, priority)

Returns the enum values configured on your specific MantisBT instance. Use this before creating or updating issues to know which values are valid.

**Tool:** `get_issue_enums`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "priorities": [
    { "id": 10, "name": "none" },
    { "id": 20, "name": "low" },
    { "id": 30, "name": "normal" },
    { "id": 40, "name": "high" },
    { "id": 50, "name": "urgent" },
    { "id": 60, "name": "immediate" }
  ],
  "severities": [
    { "id": 10, "name": "feature" },
    { "id": 20, "name": "trivial" },
    { "id": 50, "name": "major" },
    { "id": 60, "name": "crash" }
    // ...
  ],
  "statuses": [
    { "id": 10, "name": "new" },
    { "id": 50, "name": "assigned" },
    { "id": 80, "name": "resolved" },
    { "id": 90, "name": "closed" }
    // ...
  ],
  "resolutions": [
    { "id": 10, "name": "open" },
    { "id": 20, "name": "fixed" },
    { "id": 60, "name": "duplicate" }
    // ...
  ]
}
```

> **Note:** On localized installations, `get_issue_enums()` returns a `name` in the local language and an optional `canonical_name` with the English original. `create_issue` accepts **both** — pass either the canonical English name (e.g. `minor`) or the localized name (e.g. `Unschönheit`). The server resolves the value automatically.

---

### Discover valid field names for `select`

Returns all field names that can be passed to the `select` parameter of `list_issues`.

**Tool:** `get_issue_fields`

**Parameters:**
- `project_id` — _(optional)_ restrict to fields available for a specific project

**Request:**

```json
{
  "project_id": 3
}
```

**Response:**

```json
{
  "fields": [
    "additional_information", "attachments", "category", "created_at",
    "description", "fixed_in_version", "handler", "id", "notes",
    "priority", "project", "relationships", "reporter", "resolution",
    "severity", "status", "summary", "tags", "target_version",
    "updated_at", "version", "view_state"
  ],
  "source": "live"
}
```

---

## Issues

### Fetch a single issue

Retrieves a single issue by its numeric ID including notes, attachments, tags, and relationships.

**Tool:** `get_issue`

**Parameters:**
- `id` — numeric issue ID

**Request:**

```json
{
  "id": 1042
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "description": "Tapping the login button on iPhone 14 / Safari 17 does nothing.",
  "project": { "id": 3, "name": "Webshop" },
  "category": { "id": 1, "name": "UI" },
  "status": { "id": 50, "name": "assigned" },
  "resolution": { "id": 10, "name": "open" },
  "priority": { "id": 30, "name": "normal" },
  "severity": { "id": 50, "name": "major" },
  "reporter": { "id": 4, "name": "jsmith" },
  "handler": { "id": 7, "name": "jdoe" },
  "created_at": "2024-11-03T09:14:22+00:00",
  "updated_at": "2024-11-05T14:02:11+00:00",
  "tags": [],
  "notes": [],
  "attachments": [],
  "relationships": [],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

---

### Fetch multiple issues in one call

Fetches up to 50 issues in a single MCP call. Requests run in parallel (max 5 concurrent). Missing or inaccessible IDs return `null` at their position — the call never fails due to individual missing IDs.

**Tool:** `get_issues`

**Parameters:**
- `ids` — array of numeric issue IDs (1–50)

**Request:**

```json
{
  "ids": [1042, 1041, 9999]
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "view_url": "https://mantis.example.com/view.php?id=1042"
    },
    {
      "id": 1041,
      "summary": "Checkout total rounds incorrectly",
      "status": { "id": 40, "name": "confirmed" },
      "view_url": "https://mantis.example.com/view.php?id=1041"
    },
    null
  ],
  "requested": 3,
  "found": 2,
  "failed": 1
}
```

> **Note:** `null` entries indicate IDs that were not found or could not be accessed. Check `failed` to see how many IDs could not be retrieved.

---

### List issues (paginated)

Returns a paginated list of issues, optionally scoped to a project.

**Tool:** `list_issues`

**Parameters:**
- `project_id` — _(optional)_ numeric project ID
- `page` — _(optional)_ page number, default 1
- `page_size` — _(optional)_ issues per page, default 50

**Request:**

```json
{
  "project_id": 3,
  "page": 1,
  "page_size": 25
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" },
      "view_url": "https://mantis.example.com/view.php?id=1042"
    },
    {
      "id": 1041,
      "summary": "Checkout total rounds incorrectly",
      "status": { "id": 40, "name": "confirmed" },
      "handler": { "id": 4, "name": "jsmith" },
      "view_url": "https://mantis.example.com/view.php?id=1041"
    }
    // ...
  ]
}
```

---

### Reduce response size with `select`

Pass a comma-separated list of field names to receive only the fields you need. Significantly reduces payload size for large lists.

**Tool:** `list_issues`

**Parameters:**
- `project_id` — _(optional)_ numeric project ID
- `select` — comma-separated field names

**Request:**

```json
{
  "project_id": 3,
  "select": "id,summary,status,handler"
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" },
      "view_url": "https://mantis.example.com/view.php?id=1042"
    }
    // ...
  ]
}
```

> **Note:** Use `get_issue_fields()` to see all available field names.

> **Note:** `view_url` is always present in all issue responses — it is injected by the MCP server and is not affected by the `select` parameter.

---

### Filter by status

Returns only issues with a specific status. The filter is applied client-side — the tool scans up to 500 issues internally.

**Tool:** `list_issues`

**Parameters:**
- `project_id` — _(optional)_ numeric project ID
- `status` — status name string (e.g. `"new"`, `"assigned"`, `"resolved"`)

**Request:**

```json
{
  "project_id": 3,
  "status": "assigned"
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" }
    }
    // ...
  ]
}
```

> **Note:** Canonical status names (e.g. `"new"`, `"resolved"`) are resolved to their numeric ID and matched by `issue.status.id` — this works correctly even on localized installations where the API returns translated status names. Localized names passed directly (e.g. `"Neu"`) are matched by name as a fallback. The `"open"` shorthand (all statuses with id < 80) is always available regardless of installation language.

> **Note:** For large projects with many issues, use a pre-saved MantisBT filter via `filter_id` instead — client-side filtering only scans the first 500 issues (10 pages × 50).

---

### Filter by assignee or reporter

Returns issues filtered by the assigned user or reporter. Both filters are applied client-side.

**Tool:** `list_issues`

**Parameters:**
- `project_id` — _(optional)_ numeric project ID
- `assigned_to` — _(optional)_ numeric user ID of the assignee
- `reporter_id` — _(optional)_ numeric user ID of the reporter

**Request:**

```json
{
  "project_id": 3,
  "assigned_to": 7
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" }
    }
    // ...
  ]
}
```

---

### Apply a saved filter

Use a pre-saved MantisBT filter by its ID. This is the recommended approach for large datasets.

**Step 1 — List available filters:**

**Tool:** `list_filters`

**Request:**

```json
{}
```

**Response:**

```json
[
  { "id": 12, "name": "My open issues", "owner": { "id": 4, "name": "jsmith" } },
  { "id": 15, "name": "Critical bugs", "owner": { "id": 4, "name": "jsmith" } }
]
```

**Step 2 — Fetch issues using the filter ID:**

**Tool:** `list_issues`

**Parameters:**
- `filter_id` — numeric filter ID from step 1

**Request:**

```json
{
  "filter_id": 12
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" }
    }
    // ...
  ]
}
```

---

### Create an issue

Creates a new issue in MantisBT.

**Tool:** `create_issue`

**Parameters:**
- `summary` — issue title
- `project_id` — numeric project ID
- `category` — category name string
- `description` — _(optional)_ detailed description
- `priority` — _(optional)_ priority: canonical English name (`none`, `low`, `normal`, `high`, `urgent`, `immediate`) or localized label. Default: `"normal"`. Use `get_issue_enums()` to see all available values.
- `severity` — _(optional)_ severity: canonical English name (`feature`, `trivial`, `text`, `tweak`, `minor`, `major`, `crash`, `block`) or localized label. Default: `"minor"`. Use `get_issue_enums()` to see all available values.
- `handler` — _(optional)_ assignee username (resolved to ID automatically)
- `handler_id` — _(optional)_ assignee numeric user ID (alternative to `handler`)

**Request:**

```json
{
  "summary": "Login button unresponsive on mobile Safari",
  "project_id": 3,
  "category": "UI",
  "description": "Tapping the login button on iPhone 14 / Safari 17 does nothing.",
  "severity": "major",
  "handler": "jsmith"
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "description": "Tapping the login button on iPhone 14 / Safari 17 does nothing.",
  "project": { "id": 3, "name": "Webshop" },
  "category": { "id": 1, "name": "UI" },
  "status": { "id": 10, "name": "new" },
  "resolution": { "id": 10, "name": "open" },
  "priority": { "id": 30, "name": "normal" },
  "severity": { "id": 50, "name": "major" },
  "reporter": { "id": 4, "name": "jsmith" },
  "handler": { "id": 4, "name": "jsmith" },
  "created_at": "2024-11-03T09:14:22+00:00",
  "updated_at": "2024-11-03T09:14:22+00:00",
  "tags": [],
  "notes": [],
  "attachments": [],
  "relationships": [],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

**Error: unknown severity or priority**

The server first checks canonical English names, then falls back to a live `get_issue_enums` lookup. An error is only returned if the value matches neither:

> Error: Invalid severity "xyz". Valid canonical names: feature, trivial, text, tweak, minor, major, crash, block. Call get_issue_enums to see localized labels.

Use `get_issue_enums` to discover all accepted values — both canonical and localized names work.

---

### Close an issue (status + resolution)

Resolves and closes an issue. Always set **both** `status` and `resolution` — setting only status leaves resolution as "open".

**Tool:** `update_issue`

**Parameters:**
- `id` — numeric issue ID
- `fields.status` — status object with name
- `fields.resolution` — resolution object with id

> **Note:** All enum fields (`status`, `priority`, `severity`, `resolution`, `reproducibility`) accept the canonical English name, a localized name, or a numeric `id`. The server resolves names to IDs automatically — IDs are always sent to the API, ensuring language-independence.

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "status": { "name": "resolved" },
    "resolution": { "id": 20 }
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "status": { "id": 80, "name": "resolved" },
  "resolution": { "id": 20, "name": "fixed" },
  "updated_at": "2024-11-06T10:30:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Note:** Resolution ID 20 is "fixed" in a default MantisBT installation. Use `get_issue_enums()` to confirm the correct ID for your instance.

---

### Reassign an issue

Changes the handler (assignee) of an existing issue.

**Tool:** `update_issue`

**Parameters:**
- `id` — numeric issue ID
- `fields.handler` — username string (resolved to ID automatically)

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "handler": "jdoe"
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "status": { "id": 50, "name": "assigned" },
  "handler": { "id": 7, "name": "jdoe" },
  "updated_at": "2024-11-06T11:00:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

---

### Set fix version

Sets the `fixed_in_version` field on an issue.

**Tool:** `update_issue`

**Parameters:**
- `id` — numeric issue ID
- `fields.fixed_in_version` — version name string

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "fixed_in_version": "2.1.0"
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "fixed_in_version": { "name": "2.1.0" },
  "updated_at": "2024-11-06T11:15:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Note:** Use `get_project_versions(project_id)` to list valid version names for a project.

---

## Notes

### Add a public note

Adds a publicly visible note to an issue.

**Tool:** `add_note`

**Parameters:**
- `issue_id` — numeric issue ID
- `text` — note content
- `view_state` — _(optional)_ `"public"` (default) or `"private"`

**Request:**

```json
{
  "issue_id": 1042,
  "text": "Reproduced on version 2.0.3. Root cause identified in the auth middleware."
}
```

**Response:**

```json
{
  "id": 88,
  "reporter": { "id": 7, "name": "jdoe" },
  "text": "Reproduced on version 2.0.3. Root cause identified in the auth middleware.",
  "view_state": { "id": 10, "name": "public" },
  "created_at": "2024-11-05T14:02:11+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042#bugnote88"
}
```

---

### Add a private note

Adds a note visible only to developers and managers.

**Tool:** `add_note`

**Parameters:**
- `issue_id` — numeric issue ID
- `text` — note content
- `view_state` — `"private"`

**Request:**

```json
{
  "issue_id": 1042,
  "text": "Internal: this is caused by the session token not being refreshed.",
  "view_state": "private"
}
```

**Response:**

```json
{
  "id": 89,
  "reporter": { "id": 7, "name": "jdoe" },
  "text": "Internal: this is caused by the session token not being refreshed.",
  "view_state": { "id": 50, "name": "private" },
  "created_at": "2024-11-05T14:05:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042#bugnote89"
}
```

---

### Delete a note

Permanently removes a note from an issue.

**Tool:** `delete_note`

**Parameters:**
- `issue_id` — numeric issue ID
- `note_id` — numeric note ID (from `list_notes` or `get_issue`)

**Request:**

```json
{
  "issue_id": 1042,
  "note_id": 88
}
```

**Response:**

```
"Note #88 deleted from issue #1042."
```

> **Note:** This action is permanent and cannot be undone.

---

## File Attachments

### Upload a local file

Attaches a file from the local filesystem to an issue.

**Tool:** `upload_file`

**Parameters:**
- `issue_id` — numeric issue ID
- `file_path` — absolute path to the file

**Request:**

```json
{
  "issue_id": 1042,
  "file_path": "/home/user/screenshots/login-error.png"
}
```

**Response:**

```json
{
  "id": 101,
  "file_name": "login-error.png",
  "size": 14523,
  "content_type": "image/png"
}
```

> **Note:** If the MantisBT instance does not return file metadata, the response is `{ "success": true }`.

> **Note:** If `MANTIS_UPLOAD_DIR` is set, `file_path` must point to a file inside that directory. Paths outside the directory or path traversal attempts (`../`) are rejected with an error.

---

### Upload file content (base64)

Attaches a file by passing its base64-encoded content directly. Use this when the file is not on a local filesystem accessible to the server.

**Tool:** `upload_file`

**Parameters:**
- `issue_id` — numeric issue ID
- `content` — base64-encoded file content
- `filename` — filename including extension (required when using `content`)
- `content_type` — _(optional)_ MIME type
- `description` — _(optional)_ attachment description

**Request:**

```json
{
  "issue_id": 1042,
  "content": "iVBORw0KGgoAAAANSUhEUgAA...",
  "filename": "screenshot.png",
  "content_type": "image/png",
  "description": "Login error on mobile Safari"
}
```

**Response:**

```json
{
  "id": 101,
  "file_name": "screenshot.png",
  "size": 14523,
  "content_type": "image/png"
}
```

> **Note:** If the MantisBT instance does not return file metadata, the response is `{ "success": true }`.

---

### List attachments

Returns all file attachments for an issue.

**Tool:** `list_issue_files`

**Parameters:**
- `issue_id` — numeric issue ID

**Request:**

```json
{
  "issue_id": 1042
}
```

**Response:**

```json
[
  {
    "id": 23,
    "filename": "login-error.png",
    "size": 42318,
    "content_type": "image/png",
    "description": "Login error on mobile Safari",
    "created_at": "2024-11-05T15:30:00+00:00"
  }
]
```

---

## Relationships

### Mark as duplicate

Links issue A as a duplicate of issue B.

**Tool:** `add_relationship`

**Parameters:**
- `issue_id` — ID of the duplicate issue (A)
- `target_id` — ID of the original issue (B)
- `type_name` — `"duplicate_of"`

**Request:**

```json
{
  "issue_id": 1055,
  "target_id": 1042,
  "type_name": "duplicate_of"
}
```

**Response:**

```json
{
  "id": 5,
  "issue": { "id": 1055 },
  "type": { "id": 0, "name": "duplicate of" }
}
```

---

### Link as related

Creates a non-directional "related to" link between two issues.

**Tool:** `add_relationship`

**Parameters:**
- `issue_id` — numeric issue ID
- `target_id` — numeric ID of the related issue
- `type_name` — `"related_to"`

**Request:**

```json
{
  "issue_id": 1042,
  "target_id": 1038,
  "type_name": "related_to"
}
```

**Response:**

```json
{
  "id": 6,
  "issue": { "id": 1042 },
  "type": { "id": 1, "name": "related to" }
}
```

---

### Set a blocking relationship

Marks issue A as blocking issue B (B cannot proceed until A is done). The direction matters — read carefully.

**Tool:** `add_relationship`

**Parameters:**
- `issue_id` — ID of the blocking issue (A)
- `target_id` — ID of the blocked issue (B)
- `type_name` — `"parent_of"` (A blocks B) or `"child_of"` (A is blocked by B)

**Example — A blocks B:**

**Request:**

```json
{
  "issue_id": 1038,
  "target_id": 1042,
  "type_name": "parent_of"
}
```

**Response:**

```json
{
  "id": 7,
  "issue": { "id": 1038 },
  "type": { "id": 2, "name": "parent of" }
}
```

Accepted values for `type_name`:
- `duplicate_of` / `has_duplicate`
- `related_to` / `related-to`
- `parent_of` / `parent-of` / `depends_on`
- `child_of` / `child-of` / `blocks`

> **Note:** "A `child_of` B" means A is blocked by B (A depends on B). "A `parent_of` B" means A blocks B. Aliases `depends_on` (→ `parent_of`) and `blocks` (→ `child_of`) are also accepted. Dash variants (e.g. `related-to`, `parent-of`) work as well. Getting the direction wrong inverts the dependency.

---

### Remove a relationship

Removes a relationship from an issue.

**Step 1 — Get the relationship ID:**

**Tool:** `get_issue`

**Request:**

```json
{
  "id": 1042
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "relationships": [
    { "id": 5, "type": { "id": 0, "name": "duplicate of" }, "issue": { "id": 1055 } }
  ]
}
```

Read `relationships[].id` from the response.

**Step 2 — Remove the relationship:**

**Tool:** `remove_relationship`

**Parameters:**
- `issue_id` — numeric issue ID
- `relationship_id` — numeric relationship ID from step 1

**Request:**

```json
{
  "issue_id": 1042,
  "relationship_id": 5
}
```

**Response:**

```json
{ "success": true }
```

> **Note:** `relationship_id` is the ID of the relationship record itself, not the type ID or the target issue ID.

---

## Tags

### Attach tags by name

Attaches one or more tags to an issue by name. Unknown tag names are automatically created.

**Tool:** `attach_tags`

**Parameters:**
- `issue_id` — numeric issue ID
- `tags` — array of tag objects; use `{name: "..."}` to reference by name or `{id: N}` to reference by ID

**Request:**

```json
{
  "issue_id": 1042,
  "tags": [
    { "name": "needs-review" },
    { "name": "regression" }
  ]
}
```

**Response:**

```
"Tags successfully attached to issue #1042."
```

---

### Detach a tag

Removes a tag from an issue. Requires the numeric tag ID.

**Step 1 — Get the tag ID:**

**Tool:** `get_issue`

**Request:**

```json
{
  "id": 1042
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "tags": [
    { "id": 14, "name": "needs-review" },
    { "id": 17, "name": "regression" }
  ]
}
```

Read `tags[].id` from the response.

**Step 2 — Detach the tag:**

**Tool:** `detach_tag`

**Parameters:**
- `issue_id` — numeric issue ID
- `tag_id` — numeric tag ID from step 1

**Request:**

```json
{
  "issue_id": 1042,
  "tag_id": 14
}
```

**Response:**

```
"Tag #14 successfully removed from issue #1042."
```

> **Note:** `detach_tag` requires a numeric ID, not the tag name. There is no lookup by name — always retrieve the ID first via `get_issue` or `list_tags`.

---

## Monitors (Watchers)

### Add a watcher

Subscribes a user to notifications for an issue.

**Tool:** `add_monitor`

**Parameters:**
- `issue_id` — numeric issue ID
- `username` — username string

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{ "success": true }
```

---

### Remove a watcher

Unsubscribes a user from notifications for an issue.

**Tool:** `remove_monitor`

**Parameters:**
- `issue_id` — numeric issue ID
- `username` — username string

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{ "success": true }
```

---

## Semantic Search

> **Note:** All tools in this section require `MANTIS_SEARCH_ENABLED=true` in the server configuration.

### Build the initial index

Builds the full vector search index from scratch. Run this once after enabling semantic search.

**Tool:** `rebuild_search_index`

**Parameters:**
- `full` — set to `true` to clear the existing index before rebuilding

**Request:**

```json
{
  "full": true
}
```

**Response:**

```json
{
  "indexed": 312,
  "skipped": 0,
  "total": 312,
  "duration_ms": 48203
}
```

---

### Incremental index update

Updates the index with issues added or changed since the last build. Faster than a full rebuild.

**Tool:** `rebuild_search_index`

**Parameters:**
- `project_id` — _(optional)_ limit to a single project
- `full` — omit or set to `false` for incremental mode

**Request:**

```json
{
  "project_id": 3
}
```

**Response:**

```json
{
  "indexed": 14,
  "skipped": 298,
  "total": 312,
  "duration_ms": 2104
}
```

---

### Check index status

Returns the number of indexed issues, total issue count, and the timestamp of the last sync.

**Tool:** `get_search_index_status`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "summary": "312/312 (100 %)",
  "indexed": 312,
  "total": 312,
  "percent": 100,
  "last_synced_at": "2024-11-05T14:00:00.000Z"
}
```

---

### Search by meaning

Finds issues semantically similar to a natural language query. Returns issue IDs and relevance scores.

**Tool:** `search_issues`

**Parameters:**
- `query` — natural language search query
- `top_n` — _(optional)_ number of results to return; default 10
- `highlight` — _(optional)_ when `true`, adds keyword-matched excerpts to each result; default `false`

**Request:**

```json
{
  "query": "authentication fails after password reset",
  "top_n": 5
}
```

**Response:**

```json
[
  { "id": 1042, "score": 0.91, "view_url": "https://mantis.example.com/view.php?id=1042" },
  { "id": 987,  "score": 0.84, "view_url": "https://mantis.example.com/view.php?id=987" },
  { "id": 1015, "score": 0.79, "view_url": "https://mantis.example.com/view.php?id=1015" }
]
```

> **Note:** Semantic search returns the top-N most similar issues — it does not guarantee exhaustive recall. It is not suitable for "find all issues about X" census queries.

---

### Search with field enrichment

Enriches search results with specific fields fetched from MantisBT. Without `select`, only `id` and score are returned.

**Tool:** `search_issues`

**Parameters:**
- `query` — natural language search query
- `top_n` — _(optional)_ number of results
- `select` — comma-separated field names to fetch for each result
- `highlight` — _(optional)_ when `true`, adds keyword-matched excerpts to each result; default `false`

**Request:**

```json
{
  "query": "authentication fails after password reset",
  "top_n": 10,
  "select": "id,summary,status,handler"
}
```

**Response:**

```json
[
  {
    "id": 1042,
    "score": 0.91,
    "summary": "Login button unresponsive on mobile Safari",
    "status": { "id": 50, "name": "assigned" },
    "handler": { "id": 7, "name": "jdoe" },
    "view_url": "https://mantis.example.com/view.php?id=1042"
  }
  // ...
]
```

> **Note:** Using `select` triggers additional API calls to MantisBT for each result. Keep `top_n` small when using enrichment to avoid excessive requests.

---

### Search with keyword highlights

Shows which part of an issue matched the search query. Each result that has keyword overlap with the query receives a `highlights` field with bold-marked excerpts. Highlights are keyword-based (lexical), not semantic — results with no lexical overlap will not have a `highlights` field.

**Tool:** `search_issues`

**Parameters:**
- `query` — natural language search query
- `top_n` — _(optional)_ number of results; default 10
- `highlight` — set to `true` to enable highlights

**Request:**

```json
{
  "query": "login error after password reset",
  "top_n": 5,
  "highlight": true
}
```

**Response:**

```json
[
  {
    "id": 1042,
    "score": 0.91,
    "view_url": "https://mantis.example.com/view.php?id=1042",
    "highlights": {
      "summary": "**Login** button unresponsive after **password** **reset** on mobile Safari",
      "description": "…user taps **login** and nothing happens. Reproducible after a **password** **reset** flow…"
    }
  },
  {
    "id": 987,
    "score": 0.84,
    "view_url": "https://mantis.example.com/view.php?id=987",
    "highlights": {
      "summary": "**Login** fails with 401 — token invalidated"
    }
  },
  {
    "id": 1015,
    "score": 0.79,
    "view_url": "https://mantis.example.com/view.php?id=1015"
  }
]
```

> **Note:** Only results with at least one keyword match in `summary` or `description` receive a `highlights` field. The `description` excerpt is approximately 300 characters, centred around the first match. When `select` is also set and includes `summary` or `description`, highlights are generated from the fetched fields; otherwise they come from the indexed metadata.

---

## Projects & Categories

### List project categories

Returns all categories available for a MantisBT project. Use the returned names directly when creating issues.

**Tool:** `get_project_categories`

**Parameters:**
- `project_id` — numeric project ID

**Request:**

```json
{
  "project_id": 3
}
```

**Response:**

```json
[
  { "id": 1, "name": "General" },
  { "id": 2, "name": "UI" },
  { "id": 3, "name": "Backend" }
]
```

> **Note:** Category names prefixed with `[All Projects]` (inherited from the global project) have the prefix automatically stripped in the response.

---

### Find a project member

Searches project members by name, real name, or email. The search is case-insensitive and matches any substring. Results are served from the metadata cache when available; falls back to a live API call on a cold cache.

**Tool:** `find_project_member`

**Parameters:**
- `project_id` — numeric project ID
- `query` — _(optional)_ substring to match against `name`, `real_name`, or `email`
- `limit` — _(optional)_ maximum number of results, default 10, max 100

**Request:**

```json
{
  "project_id": 3,
  "query": "smith",
  "limit": 5
}
```

**Response:**

```json
[
  { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
  { "id": 11, "name": "asmith", "real_name": "Alice Smith", "email": "asmith@example.com", "access_level": { "id": 40, "name": "reporter" } }
]
```

> **Tip:** Omit `query` to list all members of the project (up to `limit`).

---

## Metadata

### Get a metadata summary

Returns a compact overview of all cached metadata: total project and tag counts, and per-project counts for users, versions, and categories. Use this to get a quick overview without transferring large arrays.

**Tool:** `get_metadata`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "projects": 24,
  "tags": 15,
  "byProject": {
    "3": { "name": "Webshop", "users": 8, "versions": 12, "categories": 4 },
    "5": { "name": "Backend API", "users": 5, "versions": 7, "categories": 3 }
  },
  "cached_at": "2026-03-27T09:00:00.000Z",
  "ttl_seconds": 82800
}
```

> **Note:** For full lists use `list_projects`, `get_project_users`, `get_project_versions`, `get_project_categories`, `list_tags`, or `get_metadata_full`.

---

### Get the full metadata cache

Returns the complete raw metadata cache as minified JSON. Contains all projects with their full field set, plus users, versions, and categories per project, and all tags. Use this when you need the complete data in a single call.

**Tool:** `get_metadata_full`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "projects": [
    {
      "id": 3,
      "name": "Webshop",
      "status": { "id": 10, "name": "development" },
      "enabled": true,
      "users": [
        { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } }
      ],
      "versions": [
        { "id": 21, "name": "2.4.0", "released": false, "obsolete": false }
      ],
      "categories": [
        { "id": 1, "name": "General" },
        { "id": 2, "name": "UI" }
      ]
    }
  ],
  "tags": [
    { "id": 1, "name": "regression" },
    { "id": 2, "name": "hotfix" }
  ],
  "cached_at": "2026-03-27T09:00:00.000Z"
}
```

> **Tip:** `get_metadata` provides the same data as a compact summary (counts only). Use `get_metadata_full` when you need the actual arrays.

---

## Version & Diagnostics

### Get MCP server version

Returns the version of this mantisbt-mcp-server instance.

**Tool:** `get_mcp_version`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "version": "1.5.8"
}
```

---

### Get MantisBT version

Returns the version of the connected MantisBT installation and optionally compares it against the latest official release on GitHub.

**Tool:** `get_mantis_version`

**Parameters:**
- `check_latest` — _(optional)_ whether to compare against the latest GitHub release; default `true`

**Request:**

```json
{
  "check_latest": true
}
```

**Response:**

```json
{
  "installed_version": "2.27.0",
  "latest_version": "2.27.1",
  "status": "update-available"
}
```

Possible values for `status`: `up-to-date`, `update-available`, `newer-than-release`, `unknown`.

> **Note:** The GitHub comparison requires an outbound HTTPS request. Set `check_latest` to `false` to skip it.

---

### Get the current user

Returns the profile of the user associated with the configured API key. Useful to verify the connection and confirm which account is being used.

**Tool:** `get_current_user`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "id": 4,
  "name": "jsmith",
  "real_name": "John Smith",
  "email": "jsmith@example.com",
  "access_level": { "id": 55, "name": "developer" }
}
```

---

## Resources

MCP Resources are URI-addressable, read-only data. Clients that support Resources can fetch them directly by URI — no tool call required. Note that Resource support is less widely implemented in MCP clients than Tools; check your client's documentation.

> **Note:** Resources are read-only. Writing to them is not possible via the Resource primitive — use the corresponding tool (`create_issue`, `update_issue`, etc.) for write operations.

### Read the current user profile

Returns the profile of the authenticated API user.

**Resource URI:** `mantis://me`

**Fetch behaviour:** Always live — calls `GET /users/me` on every access.

**Response:**

```json
{
  "id": 4,
  "name": "jsmith",
  "real_name": "John Smith",
  "email": "jsmith@example.com",
  "access_level": { "id": 55, "name": "developer" }
}
```

> **Tip:** The `get_current_user` tool provides the same data for clients that do not support Resources.

---

### Read all projects

Returns all MantisBT projects accessible with the configured API key.

**Resource URI:** `mantis://projects`

**Fetch behaviour:** Served from the MetadataCache (default TTL 24 h). Falls back to a live API call when the cache is empty. Run `sync_metadata` to force a refresh.

**Response:**

```json
[
  { "id": 3, "name": "Webshop", "status": { "id": 10, "name": "development" }, "enabled": true },
  { "id": 5, "name": "Backend API", "status": { "id": 10, "name": "development" }, "enabled": true }
]
```

> **Tip:** The `list_projects` tool provides the same data for clients that do not support Resources.

---

### Read a single project with all details

Returns a combined view of a single project: its fields plus all members, versions, and categories in one call. Served from the metadata cache when available; falls back to three parallel API calls on a cold cache. Clients that support Resource list can enumerate all available project URIs.

**Resource URI:** `mantis://projects/{id}` (replace `{id}` with the numeric project ID)

**Fetch behaviour:** Cache-first (MetadataCache, default TTL 24 h). Falls back to live API calls when the cache is empty.

**Example URI:** `mantis://projects/42`

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } }
  ],
  "versions": [
    { "id": 21, "name": "2.4.0", "released": false, "obsolete": false }
  ],
  "categories": [
    { "id": 1, "name": "General" },
    { "id": 2, "name": "UI" }
  ]
}
```

> **Tip:** Use `mantis://projects` to get a compact list of all projects, then fetch individual project details via `mantis://projects/{id}`.

---

### Read issue enum values

Returns valid ID/name pairs for all issue enum fields (severity, priority, status, resolution, reproducibility). For `create_issue`, both the canonical English name and the localized `name`/`label` are accepted — this resource helps discover all available values.

**Resource URI:** `mantis://enums`

**Fetch behaviour:** Always live — calls the MantisBT config endpoint on every access.

**Response:**

```json
{
  "priorities": [
    { "id": 10, "name": "none" },
    { "id": 20, "name": "low" },
    { "id": 30, "name": "normal" },
    { "id": 40, "name": "high" },
    { "id": 50, "name": "urgent" },
    { "id": 60, "name": "immediate" }
  ],
  "severities": [
    { "id": 10, "name": "feature" },
    { "id": 20, "name": "trivial" },
    { "id": 50, "name": "major" },
    { "id": 60, "name": "crash" }
  ],
  "statuses": [
    { "id": 10, "name": "new" },
    { "id": 50, "name": "assigned" },
    { "id": 80, "name": "resolved" },
    { "id": 90, "name": "closed" }
  ],
  "resolutions": [
    { "id": 10, "name": "open" },
    { "id": 20, "name": "fixed" },
    { "id": 60, "name": "duplicate" }
  ]
}
```

> **Tip:** The `get_issue_enums` tool provides the same data for clients that do not support Resources.

---

## Prompts

MCP prompt templates initiate a guided conversation — the client sends the prompt arguments and the server returns a pre-filled message that instructs the LLM to call the appropriate tools. For natural language equivalents, see [examples.md](examples.md).

### Create a bug report

Collects structured bug data and calls `create_issue`.

**Prompt:** `create-bug-report`

**Required arguments:**
- `project_id` — numeric project ID
- `category` — category name string
- `summary` — issue title
- `description` — detailed description of the bug

**Optional arguments:**
- `steps_to_reproduce` — step-by-step reproduction instructions
- `expected` — expected behavior
- `actual` — actual (observed) behavior
- `environment` — environment details (OS, browser, version, etc.)

**What happens:** The prompt returns a message that instructs the LLM to call `get_issue_enums` (to resolve valid severity/priority values) and then `create_issue` with the provided data.

**Example call:**

```json
{
  "project_id": 3,
  "category": "UI",
  "summary": "Login button unresponsive on mobile Safari",
  "description": "Tapping the login button on iPhone 14 / Safari 17 does nothing.",
  "steps_to_reproduce": "1. Open login page on iPhone 14\n2. Tap 'Login'\n3. Nothing happens",
  "expected": "User is logged in and redirected to dashboard",
  "actual": "Page stays on login form, no error message",
  "environment": "iPhone 14, iOS 17, Safari 17"
}
```

---

### Create a feature request

Collects feature details and calls `create_issue`.

**Prompt:** `create-feature-request`

**Required arguments:**
- `project_id` — numeric project ID
- `category` — category name string
- `summary` — feature title
- `description` — detailed description of the feature

**Optional arguments:**
- `use_case` — concrete use case or motivation for the feature

**What happens:** The prompt returns a message that instructs the LLM to call `create_issue` with severity `feature`.

**Example call:**

```json
{
  "project_id": 5,
  "category": "UX",
  "summary": "Dark mode for user settings",
  "description": "Add a dark mode toggle to the user settings page.",
  "use_case": "Users working in low-light environments report eye strain with the current bright UI."
}
```

---

### Summarize an issue

Fetches a single issue and returns a concise summary.

**Prompt:** `summarize-issue`

**Required arguments:**
- `issue_id` — numeric issue ID

**What happens:** The prompt returns a message that instructs the LLM to call `get_issue` and summarize the result — including status, priority, recent notes, and suggested next steps.

**Example call:**

```json
{
  "issue_id": 1042
}
```

---

### Project status report

Lists all issues for a project and generates a status report grouped by severity.

**Prompt:** `project-status`

**Required arguments:**
- `project_id` — numeric project ID

**What happens:** The prompt returns a message that instructs the LLM to call `list_issues` for the project and produce a structured report: open issue count, breakdown by severity, and a list of the most critical items.

**Example call:**

```json
{
  "project_id": 3
}
```

---

## Destructive Operations

### Delete an issue

Permanently deletes a MantisBT issue. This action cannot be undone.

**Tool:** `delete_issue`

**Parameters:**
- `id` — numeric issue ID

**Request:**

```json
{
  "id": 42
}
```

**Response:**

```
"Issue #42 deleted successfully."
```

> **Warning:** This action is permanent and cannot be undone.

---
