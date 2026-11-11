# Cookbook

Tool-oriented recipes for the MantisBT MCP server — each recipe shows exactly which tool to call and with which parameters. For natural language prompt examples, see [examples.md](examples.md).

---

- [Connection setup](#connection-setup)
  - [Connect to an installation without URL rewriting](#connect-to-an-installation-without-url-rewriting)
  - [Offer only some tool groups](#offer-only-some-tool-groups)
- [Discovering your instance](#discovering-your-instance)
  - [Get all projects](#get-all-projects)
  - [Valid select fields and enum values](#valid-select-fields-and-enum-values)
- [Issues](#issues)
  - [Fetch a single issue](#fetch-a-single-issue)
  - [Fetch multiple issues in one call](#fetch-multiple-issues-in-one-call)
  - [List issues (paginated)](#list-issues-paginated)
  - [Reduce response size with `select`](#reduce-response-size-with-select)
  - [Filter by status](#filter-by-status)
  - [Filter by assignee or reporter](#filter-by-assignee-or-reporter)
  - [Apply a saved filter](#apply-a-saved-filter)
  - [Count issues per status, handler, priority or category](#count-issues-per-status-handler-priority-or-category)
  - [Create an issue](#create-an-issue)
  - [Close an issue (status + resolution)](#close-an-issue-status--resolution)
  - [Resolve an issue with a reason note (single call)](#resolve-an-issue-with-a-reason-note-single-call)
  - [Set custom fields](#set-custom-fields)
  - [Reassign an issue](#reassign-an-issue)
  - [Set fix version](#set-fix-version)
- [Notes](#notes)
  - [Get notes for an issue](#get-notes-for-an-issue)
  - [Add a public note](#add-a-public-note)
  - [Add a private note](#add-a-private-note)
  - [Delete a note](#delete-a-note)
  - [Edit a note](#edit-a-note)
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
  - [Change watchers via update_issue](#change-watchers-via-update_issue)
  - [Add a watcher (deprecated)](#add-a-watcher-deprecated)
  - [Remove a watcher (deprecated)](#remove-a-watcher-deprecated)
- [Semantic Search](#semantic-search)
  - [Build the initial index](#build-the-initial-index)
  - [Incremental index update](#incremental-index-update)
  - [Check index status](#check-index-status)
  - [Search by meaning](#search-by-meaning)
  - [Search with field enrichment](#search-with-field-enrichment)
- [Projects & Categories](#projects--categories)
  - [Get a project with categories, users and versions](#get-a-project-with-categories-users-and-versions)
  - [List project categories](#list-project-categories)
  - [Find a project member](#find-a-project-member)
  - [Create a project version](#create-a-project-version)
  - [Update a project version](#update-a-project-version)
  - [Release a version and create the next bugfix placeholder (deprecated)](#release-a-version-and-create-the-next-bugfix-placeholder-deprecated)
  - [Delete a project version](#delete-a-project-version)
- [Metadata](#metadata)
  - [Get a metadata summary](#get-a-metadata-summary)
  - [Refresh the metadata cache](#refresh-the-metadata-cache)
  - [Get the full metadata cache](#get-the-full-metadata-cache)
- [Version & Diagnostics](#version--diagnostics)
  - [Get versions (MCP server and MantisBT)](#get-versions-mcp-server-and-mantisbt)
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

## Connection setup

### Connect to an installation without URL rewriting

Some MantisBT installations serve the REST API only through its front controller — typically Apache without `mod_rewrite`, or IIS without a rewrite module. There, `/api/rest/issues` returns 404 while `/api/rest/index.php/issues` works.

**Option A — set the flag explicitly:**

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com",
    "MANTIS_API_KEY": "your-api-token",
    "MANTIS_USE_INDEX_PHP": "true"
  }
}
```

**Option B — paste the full REST URL and let the server detect it:**

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com/api/rest/index.php",
    "MANTIS_API_KEY": "your-api-token"
  }
}
```

When `MANTIS_BASE_URL` ends with `/api/rest/index.php`, index.php routing is enabled automatically. An explicitly set `MANTIS_USE_INDEX_PHP` always wins over the detection — setting it to `false` alongside such a URL forces plain `/api/rest/` routing and logs a warning on stderr.

**Verify:** call `get_version`. A successful response means the routing is correct.

---

### Offer only some tool groups

By default all 41 tools are active (search off). Restrict them with `MANTIS_TOOLSETS` to keep the model's context shorter and load only what is needed for the task. Use `MANTIS_DISABLE_DESTRUCTIVE=true` to hide every destructive tool regardless of the active groups; `update_issue` then also rejects `remove_monitors`.

Valid group names: `issues`, `notes`, `links`, `files`, `projects`, `versions`, `meta`, `search`. An unknown name stops the server at startup with a message listing the valid ones. Deprecated tools always belong to the same group as their replacement. For the complete group-to-tool mapping see [Limit the offered tools in the README](../README.md#limit-the-offered-tools).

**Example A — triage setup** (`issues`, `notes`, `meta`; no destructive operations):

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com",
    "MANTIS_API_KEY": "your-api-token",
    "MANTIS_TOOLSETS": "issues,notes,meta",
    "MANTIS_DISABLE_DESTRUCTIVE": "true"
  }
}
```

**Example B — all groups, delete-protection only** (36 of the 41 default tools):

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com",
    "MANTIS_API_KEY": "your-api-token",
    "MANTIS_DISABLE_DESTRUCTIVE": "true"
  }
}
```

The `search` group additionally requires `MANTIS_SEARCH_ENABLED=true`. Without the `search` group in `MANTIS_TOOLSETS`, the search module — index, embedding model, background sync — is not started at all, even if `MANTIS_SEARCH_ENABLED=true` is set.

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

### Valid select fields and enum values

Returns the valid `select` field names and the enum values (severity, status, priority, resolution, reproducibility) for this MantisBT server in one call. Use this before building a `select` string or before setting enum fields on `create_issue` / `update_issue`.

**Tool:** `get_issue_schema`

**Parameters:**
- `project_id` — _(optional)_ restrict the field discovery sample to a specific project

**Request:**

```json
{}
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
  "fields_source": "live",
  "enums": {
    "severity": [
      { "id": 10, "name": "feature" },
      { "id": 20, "name": "trivial" },
      { "id": 50, "name": "major" },
      { "id": 60, "name": "crash" }
    ],
    "status": [
      { "id": 10, "name": "new" },
      { "id": 50, "name": "assigned" },
      { "id": 80, "name": "resolved" },
      { "id": 90, "name": "closed" }
    ],
    "priority": [
      { "id": 10, "name": "none" },
      { "id": 20, "name": "low" },
      { "id": 30, "name": "normal" },
      { "id": 40, "name": "high" },
      { "id": 50, "name": "urgent" },
      { "id": 60, "name": "immediate" }
    ],
    "resolution": [
      { "id": 10, "name": "open" },
      { "id": 20, "name": "fixed" },
      { "id": 60, "name": "duplicate" }
    ],
    "reproducibility": [
      { "id": 10, "name": "always" },
      { "id": 30, "name": "sometimes" },
      { "id": 70, "name": "have not tried" }
    ]
  }
}
```

`fields_source` is `"cache"`, `"live"`, or `"static"`. On localized installations each enum entry may include a `label` (localized) and a `canonical_name` (standard English). `create_issue` accepts both — pass the canonical English name (e.g. `minor`) or the localized name; the server resolves it automatically.

> **Deprecated:** `get_issue_fields` (fields only) and `get_issue_enums` (enums only) are superseded by `get_issue_schema` — they will be removed in 2.0.0. The resource `mantis://enums` stays.

---

## Issues

### Fetch a single issue

Retrieves a single issue by its numeric ID including notes, attachments, tags, and relationships.

**Tool:** `get_issue`

**Parameters:**
- `id` — numeric issue ID
- `select` — _(optional)_ comma-separated field list (server-side projection); significantly reduces response size for large issues, e.g. `"id,summary,status,notes"`

**Request:**

```json
{
  "id": 1042
}
```

Compact variant (only the fields you need):

```json
{
  "id": 1042,
  "select": "id,summary,status,handler"
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

**Tool:** `get_issue`

**Parameters:**
- `ids` — array of numeric issue IDs (1–50)
- `select` — _(optional)_ comma-separated field list

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

> **Deprecated:** `get_issues` provides the same functionality but is deprecated — use `get_issue` with `ids` as shown above; `get_issues` will be removed in 2.0.0.

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

> **Note:** Use `get_issue_schema()` to see all available field names.

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

### Count issues per status, handler, priority or category

Returns the number of matching issues grouped by a single field instead of listing individual issues — far fewer tokens than reading all pages.

**Tool:** `list_issues`

**Parameters:**
- `project_id` — _(optional)_ numeric project ID
- `group_by` — `"status"`, `"handler"`, `"priority"`, or `"category"`
- `status`, `assigned_to`, `reporter_id`, date filters — _(optional)_ all filters still apply; `page`, `page_size`, and `select` are ignored

**Request:**

```json
{
  "project_id": 3,
  "group_by": "status"
}
```

**Response:**

```json
{
  "group_by": "status",
  "total": 604,
  "groups": [
    { "id": 80, "name": "resolved", "label": "resolved", "count": 412 },
    { "id": 50, "name": "assigned", "label": "assigned", "count": 98 },
    { "id": 40, "name": "confirmed", "label": "confirmed", "count": 57 },
    { "id": 20, "name": "feedback", "label": "feedback", "count": 37 }
  ]
}
```

Groups are sorted by count descending, then by name ascending. The `label` field contains the localized display name and is omitted for groups that have no label (e.g. handler).

**Request (handler, open issues only):**

```json
{
  "project_id": 3,
  "group_by": "handler",
  "status": "open"
}
```

**Response:**

```json
{
  "group_by": "handler",
  "total": 185,
  "groups": [
    { "id": 7, "name": "jdoe", "count": 72 },
    { "id": 4, "name": "jsmith", "count": 68 },
    { "id": null, "name": "(unassigned)", "count": 45 }
  ]
}
```

> **Note:** The server scans all matching issues up to a limit of 50,000. If the limit is reached, the response contains `"truncated": true` and the counts are incomplete. This is a much larger scan than the 500-issue limit of client-side filters in `list_issues`.

---

### Create an issue

Creates a new issue in MantisBT.

**Tool:** `create_issue`

**Parameters:**
- `summary` — issue title
- `project_id` — numeric project ID
- `category` — category name string
- `description` — _(optional)_ detailed description
- `priority` — _(optional)_ priority: canonical English name (`none`, `low`, `normal`, `high`, `urgent`, `immediate`) or localized label. Default: `"normal"`. Use `get_issue_schema()` to see all available values.
- `severity` — _(optional)_ severity: canonical English name (`feature`, `trivial`, `text`, `tweak`, `minor`, `major`, `crash`, `block`) or localized label. Default: `"minor"`. Use `get_issue_schema()` to see all available values.
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

The server first checks canonical English names, then falls back to a live enum lookup. An error is only returned if the value matches neither:

> Error: Invalid severity "xyz". Valid canonical names: feature, trivial, text, tweak, minor, major, crash, block. Call get_issue_schema to see localized labels.

Use `get_issue_schema` to discover all accepted values — both canonical and localized names work.

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

> **Note:** Resolution ID 20 is "fixed" in a default MantisBT installation. Use `get_issue_schema()` to confirm the correct ID for your instance.

---

### Resolve an issue with a reason note (single call)

Changes the status and appends a note explaining the change — in one `update_issue` call, no separate `add_note` needed.

**Tool:** `update_issue`

**Parameters:**
- `id` — numeric issue ID
- `fields` — fields to change
- `note` — note text appended after a successful update
- `note_view_state` — _(optional)_ `"public"` (default) or `"private"`

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "status": { "name": "resolved" },
    "resolution": { "id": 20 }
  },
  "note": "Fixed in commit abc123 — the touch event handler was missing on iOS."
}
```

**Response:** the updated issue plus a `note` object with its `view_url`.

> **Note:** If the update succeeds but the note fails, the response contains `note_error` instead of failing the whole call — retry with `add_note`. For a note without field changes use `add_note` directly.

---

### Get a short response instead of the whole issue

By default `update_issue` and `create_issue` return the whole issue, including description, notes and history — several thousand tokens on a busy issue. With `response: "short"` you get only what confirms the change.

**Tool:** `update_issue` (works the same way for `create_issue`)

**Parameters:**
- `response` — _(optional)_ `"full"` (default) or `"short"`. The default changes to `"short"` in 2.0.0.

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "status": { "name": "resolved" },
    "resolution": { "id": 20 }
  },
  "note": "Fixed in commit abc123.",
  "response": "short"
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login fails on iOS",
  "status": { "id": 80, "name": "resolved", "label": "resolved" },
  "resolution": { "id": 20, "name": "fixed", "label": "fixed" },
  "updated_at": "2026-11-09T13:21:00+01:00",
  "view_url": "https://mantis.example.com/view.php?id=1042",
  "note": { "id": 4957, "view_url": "https://mantis.example.com/view.php?id=1042#bugnote4957" }
}
```

`update_issue` returns `id`, `summary`, `status`, `resolution`, `updated_at`, `view_url` and every field you changed; `custom_fields` and `notes` (edits via `fields.notes`) are narrowed to the entries you changed, an appended note to `id` and `view_url`. `monitors` and the `*_error` keys appear as with `"full"`. `create_issue` returns `id`, `summary`, `project`, `category`, `status`, `handler`, `created_at` and `view_url`.

---

### Set custom fields

Writes custom field values on create or update. The same `custom_fields` format works for both `create_issue` and `update_issue` (inside `fields`).

**Tool:** `update_issue`

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "custom_fields": [
      { "field": { "name": "Customer" }, "value": "ACME Corp" },
      { "field": { "id": 3 }, "value": "2026-07-01" }
    ]
  }
}
```

> **Note:** Only the listed custom fields are changed — others stay untouched. Use `get_issue_schema()` or `get_metadata()` to discover available custom fields per project. Values are always strings.

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

> **Note:** Use `get_project` with `include: ["versions"]` to list valid version names for a project.

---

## Notes

### Get notes for an issue

Retrieves only the notes of an issue using server-side field projection. This is the preferred alternative to the deprecated `list_notes` tool.

**Tool:** `get_issue`

**Parameters:**
- `id` — numeric issue ID
- `select` — `"id,notes"` (include `id` so `view_url` is always set even when the projection omits it)

**Request:**

```json
{
  "id": 1042,
  "select": "id,notes"
}
```

**Response:**

```json
{
  "id": 1042,
  "notes": [
    {
      "id": 88,
      "reporter": { "id": 7, "name": "jdoe" },
      "text": "Reproduced on version 2.0.3. Root cause identified in the auth middleware.",
      "view_state": { "id": 10, "name": "public" },
      "created_at": "2024-11-05T14:02:11+00:00",
      "view_url": "https://mantis.example.com/view.php?id=1042#bugnote88"
    }
  ],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Deprecated:** `list_notes` will be removed in 2.0.0 — use `get_issue` with `select: "id,notes"` as shown above.

---

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
- `note_id` — numeric note ID (from `get_issue`)

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

### Edit a note

Edits the text and/or visibility of an existing note via `update_issue`. The note ID comes from `get_issue`. At least one of `text` or `view_state` must be given. Multiple notes can be edited in a single call.

**Tool:** `update_issue`

**Parameters:**
- `id` — numeric issue ID
- `fields.notes` — array of note edits: `{ id, text?, view_state? }`; omitting `view_state` keeps the note's current visibility

**Request:** _(text-only edit)_

```json
{
  "id": 1042,
  "fields": {
    "notes": [
      { "id": 88, "text": "Reproduced on version 2.0.4 — auth middleware is missing a null check." }
    ]
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "notes": [
    {
      "id": 88,
      "text": "Reproduced on version 2.0.4 — auth middleware is missing a null check.",
      "view_state": { "id": 10, "name": "public" },
      "updated_at": "2024-11-06T12:00:00+00:00"
    }
  ],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Note:** Unknown note IDs are rejected before any write. If MantisBT did not apply an edit, the response contains `notes_error` with the details instead of failing the call — only when the note edit was the only requested change does the call return an error. To add a new note use the `note` parameter or `add_note`.

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

> **Note:** If `MANTIS_UPLOAD_DIR` is set, `file_path` must point to a file inside that directory. Paths outside the directory, path traversal attempts (`../`) and symbolic links that lead outside are rejected with an error.

---

### Upload file content (base64)

Attaches a file by passing its base64-encoded content directly. Use this **only** as a fallback when the file is not accessible via a path on the server filesystem (e.g. in-memory data or files generated on the client side). Prefer `file_path` whenever the file exists on disk — the server reads and encodes it automatically. Over the HTTP transport a request may be at most 64 MB, which fits files up to about 48 MB.

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

Returns all file attachments for an issue using server-side field projection. Each attachment includes a `download_url` built from the MantisBT file download endpoint.

**Tool:** `get_issue`

**Parameters:**
- `id` — numeric issue ID
- `select` — `"id,attachments"`

**Request:**

```json
{
  "id": 1042,
  "select": "id,attachments"
}
```

**Response:**

```json
{
  "id": 1042,
  "attachments": [
    {
      "id": 23,
      "filename": "login-error.png",
      "size": 42318,
      "content_type": "image/png",
      "created_at": "2024-11-05T15:30:00+00:00",
      "reporter": { "id": 4, "name": "jsmith" },
      "download_url": "https://mantis.example.com/file_download.php?file_id=23&type=bug"
    }
  ],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Deprecated:** `list_issue_files` will be removed in 2.0.0 — use `get_issue` with `select: "id,attachments"` as shown above.

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

### Change watchers via update_issue

Adds and/or removes watchers (monitors) of an issue in a single `update_issue` call. `fields` may be omitted — only `add_monitors`, `remove_monitors`, or both are required. Names are matched case-insensitively.

**Tool:** `update_issue`

**Parameters:**
- `id` — numeric issue ID
- `add_monitors` — _(optional)_ array of MantisBT login names to add as watchers
- `remove_monitors` — _(optional)_ array of MantisBT login names to remove from watchers; names not currently watching are silently skipped
- A user listed in both arrays is rejected.

**Request:** _(add one watcher)_

```json
{
  "id": 1042,
  "add_monitors": ["jsmith"]
}
```

**Response:**

```json
{
  "id": 1042,
  "view_url": "https://mantis.example.com/view.php?id=1042",
  "monitors": {
    "added": ["jsmith"],
    "current": ["asmith", "jsmith"]
  }
}
```

**Request:** _(remove one watcher)_

```json
{
  "id": 1042,
  "remove_monitors": ["jsmith"]
}
```

**Response:**

```json
{
  "id": 1042,
  "view_url": "https://mantis.example.com/view.php?id=1042",
  "monitors": {
    "removed": ["jsmith"],
    "not_monitoring": [],
    "current": ["asmith"]
  }
}
```

`monitors.current` always lists all remaining watchers. `monitors.added` lists names successfully added; `monitors.removed` lists names successfully removed; `monitors.not_monitoring` lists names that were not watching and were therefore skipped. Adding or removing other users requires the `monitor_add_others_bug_threshold` / `monitor_delete_others_bug_threshold` access level. The steps run in order — `fields`, monitors, `note`. Once one of them succeeded, a later failure is reported inline as `monitors_error` or `note_error` (nothing is rolled back); only when every requested step failed does the call return an error.

---

### Add a watcher (deprecated)

> **Deprecated:** use `update_issue` with `add_monitors` instead — `add_monitor` will be removed in 2.0.0.

Subscribes a user to notifications for an issue.

**Tool:** `add_monitor`

**Parameters:**
- `issue_id` — numeric issue ID
- `username` — MantisBT login name

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{
  "success": true,
  "monitors": ["asmith", "jsmith"]
}
```

`monitors` lists all users now watching the issue. Adding a user who already watches it changes nothing and still succeeds. Adding another user requires the `monitor_add_others_bug_threshold` access level.

---

### Remove a watcher (deprecated)

> **Deprecated:** use `update_issue` with `remove_monitors` instead — `remove_monitor` will be removed in 2.0.0.

Unsubscribes a user from notifications for an issue.

**Tool:** `remove_monitor`

**Parameters:**
- `issue_id` — numeric issue ID
- `username` — MantisBT login name (case-insensitive)

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{
  "success": true,
  "removed": true,
  "monitors": ["asmith"]
}
```

`monitors` lists the users still watching the issue. If `jsmith` was not a monitor, nothing is changed and the response contains `"removed": false` plus a `message`. Removing another user requires the `monitor_delete_others_bug_threshold` access level; without it the tool returns an error.

---

## Semantic Search

> **Note:** All tools in this section require `MANTIS_SEARCH_ENABLED=true` in the server configuration.

### Build the initial index

Builds the full vector search index from scratch. Run this once after enabling semantic search.

The server also rebuilds the index by itself when it was made with another embedding model or in another way — after `MANTIS_SEARCH_MODEL` was changed, or after an update that changes how issues are embedded. A full rebuild of 7,700 issues took about 6 minutes with the default of 1 thread and less than 3 minutes with `MANTIS_SEARCH_THREADS=4`.

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

Updates the index with issues added or changed since the last sync. Faster than a full rebuild: only issues changed since then are fetched and re-embedded.

Only one server process syncs the shared index at a time. If another process (for example another client session) is already syncing, the tool returns an error ("A search index sync is already running") — try again once that sync has finished. A sync limited to `project_id` does not advance `last_synced_at`, so changes in other projects are still picked up by the next sync. If the index was made with another embedding model or version, the sync rebuilds it for all projects, even with `project_id`.

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
  "skipped": 0,
  "total": 312,
  "duration_ms": 2104
}
```

---

### Check index status

Returns the number of indexed issues, total issue count, and the timestamp of the last sync. `last_synced_at` is the newest `updated_at` the MantisBT server reported at that sync (server time), so it can lie before the actual time of the sync.

**Tool:** `get_metadata`

**Parameters:** _(none)_

**Request:**

```json
{}
```

**Response (relevant excerpt):**

```json
{
  "projects": 24,
  "tags": 15,
  "byProject": { "3": { "name": "Webshop", "users": 8, "versions": 12, "categories": 4 } },
  "cached_at": "2026-03-27T09:00:00.000Z",
  "ttl_seconds": 82800,
  "search_index": {
    "summary": "312/312 (100 %)",
    "indexed": 312,
    "total": 312,
    "percent": 100,
    "last_synced_at": "2024-11-05T14:00:00+01:00"
  }
}
```

> **Deprecated:** `get_search_index_status` will be removed in 2.0.0 — use `get_metadata` (field `search_index`) as shown above.

---

### Search by meaning

Finds issues semantically similar to a natural language query, combined with keyword matching so that exact terms (identifiers, error codes, version numbers) are found as well. Returns issue IDs and relevance scores. `score` is the semantic similarity; the order follows the combined ranking, so a result with an exact keyword match can come before one with a higher `score`. Issues that contain an identifier from the query as a whole — an order number, a CVE, a version, a code name such as `MANTIS_SEARCH_DIR` — are listed before all others, unless the identifier occurs in more than 20 issues.

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

> **Note:** Semantic search returns the top-N most similar issues — it does not guarantee exhaustive recall. It is not suitable for "find all issues about X" census queries. The exception is a query for a rare identifier: the issues that contain it come first (see below), so with a large enough `top_n` they are all listed.

---

### Search for an identifier

A query for an order number, a CVE, a version or a code name lists every issue that contains it as a whole before all other results. Identifiers are recognised by their form: an underscore, a capital inside the word, letters with digits, five or more digits, or parts joined by `-` `.` `:` `/` with a digit. `1.15` does not match `1.15.2`, and `CVE-2026-1234` does not match `CVE-2026-12345`. Plain words and short numbers keep the combined ranking, as does an identifier that occurs in more than 20 issues.

**Tool:** `search_issues`

**Request:**

```json
{
  "query": "CVE-2026-1234",
  "top_n": 5
}
```

**Response:**

```json
[
  { "id": 2210, "score": 0.58, "view_url": "https://mantis.example.com/view.php?id=2210" },
  { "id": 2211, "score": 0.47, "view_url": "https://mantis.example.com/view.php?id=2211" },
  { "id": 2084, "score": 0.65, "view_url": "https://mantis.example.com/view.php?id=2084" },
  { "id": 1977, "score": 0.63, "view_url": "https://mantis.example.com/view.php?id=1977" },
  { "id": 2150, "score": 0.61, "view_url": "https://mantis.example.com/view.php?id=2150" }
]
```

Issues 2210 and 2211 contain `CVE-2026-1234` and come first, although issue 2084 has the higher `score`.

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

### Get a project with categories, users and versions

Retrieves a project's master data plus any combination of its categories, users and versions in one call. Categories come without the `[All Projects]` prefix — ready for use in `create_issue`. `member_query` filters users by a case-insensitive substring in login name, real name or email, and returns all matches.

**Tool:** `get_project`

**Parameters:**
- `project_id` — numeric project ID (use `list_projects` to discover)
- `include` — _(optional)_ array of `"categories"`, `"users"`, `"versions"` (any combination)
- `access_level` — _(optional)_ only users at or above this level (10=viewer, 25=reporter, 40=updater, 55=developer, 70=manager, 90=administrator); implies `"users"`
- `member_query` — _(optional)_ case-insensitive substring; implies `"users"`, returns all matches
- `obsolete` — _(optional)_ include obsolete versions; implies `"versions"`
- `inherit` — _(optional)_ include versions inherited from parent projects; implies `"versions"`

**Request:** _(master data + categories + users + versions)_

```json
{
  "project_id": 3,
  "include": ["categories", "users", "versions"]
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "description": "Main customer-facing storefront",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "view_state": { "id": 10, "name": "public" },
  "categories": [
    { "id": 1, "name": "General" },
    { "id": 2, "name": "UI" },
    { "id": 3, "name": "Backend" }
  ],
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
    { "id": 7, "name": "jdoe", "real_name": "Jane Doe", "email": "jdoe@example.com", "access_level": { "id": 70, "name": "manager" } }
  ],
  "versions": [
    { "id": 42, "name": "1.2.0", "released": false, "obsolete": false, "timestamp": "2026-10-31T00:00:00+00:00" },
    { "id": 43, "name": "1.2.1", "released": false, "obsolete": false, "timestamp": "2026-10-31T00:00:00+00:00" }
  ]
}
```

**Request:** _(member search)_

```json
{
  "project_id": 3,
  "member_query": "smith"
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
    { "id": 11, "name": "asmith", "real_name": "Alice Smith", "email": "asmith@example.com", "access_level": { "id": 40, "name": "updater" } }
  ]
}
```

> **Note:** `get_project_categories`, `get_project_users`, `get_project_versions`, and `find_project_member` are deprecated in favour of `get_project` with `include` / `member_query` and will be removed in 2.0.0.

---

### List project categories

Returns all categories available for a MantisBT project. Use the returned names directly when creating issues.

**Tool:** `get_project`

**Parameters:**
- `project_id` — numeric project ID
- `include` — `["categories"]`

**Request:**

```json
{
  "project_id": 3,
  "include": ["categories"]
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "categories": [
    { "id": 1, "name": "General" },
    { "id": 2, "name": "UI" },
    { "id": 3, "name": "Backend" }
  ]
}
```

> **Note:** Category names prefixed with `[All Projects]` (inherited from the global project) have the prefix automatically stripped in the response.

> **Deprecated:** `get_project_categories` will be removed in 2.0.0 — use `get_project` with `include: ["categories"]` as shown above.

---

### Find a project member

Searches project members by name, real name, or email. The search is case-insensitive and matches any substring. All matching users are returned — there is no `limit`.

**Tool:** `get_project`

**Parameters:**
- `project_id` — numeric project ID
- `member_query` — substring to match against `name`, `real_name`, or `email`

**Request:**

```json
{
  "project_id": 3,
  "member_query": "smith"
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
    { "id": 11, "name": "asmith", "real_name": "Alice Smith", "email": "asmith@example.com", "access_level": { "id": 40, "name": "updater" } }
  ]
}
```

> **Deprecated:** `find_project_member` will be removed in 2.0.0 — use `get_project` with `member_query` as shown above. Unlike `find_project_member`, `get_project` has no `limit` and returns all matching users.

---

### Create a project version

Creates a new version in a MantisBT project. Without `timestamp`, MantisBT uses the current date. Version names must be unique within the project.

> **Permission required:** `manage_project_threshold` (MantisBT default: manager).

**Tool:** `create_version`

**Parameters:**
- `project_id` — numeric project ID
- `name` — version name, e.g. `"2.0.0"`
- `description` — _(optional)_ version description
- `released` — _(optional)_ mark the version as released; default `false`
- `obsolete` — _(optional)_ mark the version as obsolete; default `false`
- `timestamp` — _(optional)_ version date as ISO 8601 string, e.g. `"2026-09-27"`

**Request:**

```json
{
  "project_id": 3,
  "name": "2.0.0",
  "description": "Major rewrite"
}
```

**Response:**

```json
{
  "id": 50,
  "name": "2.0.0",
  "description": "Major rewrite",
  "released": false,
  "obsolete": false,
  "timestamp": "2026-09-27T00:00:00+00:00"
}
```

---

### Update a project version

Updates an existing version of a MantisBT project. Only the fields you pass are changed; at least one field is required. Renaming a version also rewrites the `version`, `target_version`, and `fixed_in_version` fields of all issues that reference it (including subprojects with inherited versions).

> **Permission required:** `manage_project_threshold` (MantisBT default: manager). Versions inherited from a parent project can only be changed via the parent's `project_id`.

**Tool:** `update_version`

**Parameters:**
- `project_id` — numeric project ID
- `version_id` — numeric version ID (use `get_project` with `include: ["versions"]` to discover)
- `name` — _(optional)_ new version name (must be unique within the project)
- `description` — _(optional)_ new version description
- `released` — _(optional)_ released flag
- `obsolete` — _(optional)_ obsolete flag
- `timestamp` — _(optional)_ version date as ISO 8601 string
- `next_version` — _(optional, only with `released: true`)_ name of a follow-up version to create as an unreleased placeholder, e.g. `"1.2.1"`; used as-is — no automatic numbering

**Request:** _(mark a version as obsolete)_

```json
{
  "project_id": 3,
  "version_id": 21,
  "obsolete": true
}
```

**Response:**

```json
{
  "id": 21,
  "name": "1.9.0",
  "released": true,
  "obsolete": true,
  "timestamp": "2025-06-01T00:00:00+00:00"
}
```

**Request:** _(release a version and create a follow-up placeholder)_

```json
{
  "project_id": 3,
  "version_id": 42,
  "released": true,
  "timestamp": "2026-10-31",
  "next_version": "1.2.1"
}
```

**Response:**

```json
{
  "version": {
    "id": 42,
    "name": "1.2.0",
    "released": true,
    "obsolete": false,
    "timestamp": "2026-10-31T00:00:00+00:00"
  },
  "next_version": {
    "id": 43,
    "name": "1.2.1",
    "released": false,
    "obsolete": false,
    "timestamp": "2026-10-31T00:00:00+00:00"
  }
}
```

Setting `released=true` does not change the version date — always pass `timestamp` with the release date. If creating the follow-up version fails, the update itself stays in effect and the error is reported as `next_version_error` in the response.

---

### Release a version and create the next bugfix placeholder (deprecated)

> **Deprecated:** use `update_version` with `released: true`, `timestamp`, and optionally `next_version` instead — `release_version` will be removed in 2.0.0. See [Update a project version](#update-a-project-version) for the replacement recipe.

Marks a version as released (setting its date) and creates a follow-up version placeholder in the same call. The follow-up version name is used as-is — no automatic numbering. If the follow-up creation fails, the release stays in effect and the error is reported in `next_version_error`.

> **Permission required:** `manage_project_threshold` (MantisBT default: manager). Versions inherited from a parent project can only be changed via the parent's `project_id`.

**Tool:** `release_version`

**Parameters:**
- `project_id` — numeric project ID
- `version_id` — numeric version ID of the version to release
- `timestamp` — _(optional)_ release date as ISO 8601 string; default: now
- `next_version` — _(optional)_ name of the follow-up version to create as an unreleased placeholder

**Request:**

```json
{
  "project_id": 3,
  "version_id": 42,
  "timestamp": "2026-09-27",
  "next_version": "1.2.1"
}
```

**Response:**

```json
{
  "released": {
    "id": 42,
    "name": "1.2.0",
    "released": true,
    "obsolete": false,
    "timestamp": "2026-09-27T00:00:00+00:00"
  },
  "next_version": {
    "id": 43,
    "name": "1.2.1",
    "released": false,
    "obsolete": false,
    "timestamp": "2026-09-27T00:00:00+00:00"
  }
}
```

> **Note:** Setting `released=true` via `update_version` does not change the version date — always pass `timestamp` for the release date. Use `next_version` to create a follow-up version in the same call.

---

### Delete a project version

Permanently deletes a version from a MantisBT project. This action is irreversible. MantisBT clears the `version`, `target_version`, and `fixed_in_version` fields of all issues that reference the deleted version. To retire a version without touching issues, use `update_version` with `obsolete=true` instead.

> **Permission required:** `manage_project_threshold` (MantisBT default: manager). Versions inherited from a parent project can only be deleted via the parent's `project_id`.

**Tool:** `delete_version`

**Parameters:**
- `project_id` — numeric project ID
- `version_id` — numeric version ID

**Request:**

```json
{
  "project_id": 3,
  "version_id": 7
}
```

**Response:**

```
Version 7 deleted successfully.
```

---

## Metadata

### Get a metadata summary

Returns a compact overview of all cached metadata: total project and tag counts, and per-project counts for users, versions, and categories. Use this to get a quick overview without transferring large arrays.

**Tool:** `get_metadata`

**Parameters:**
- `detail` — _(optional)_ `"summary"` (default) for counts only; `"full"` for the complete raw cache
- `refresh` — _(optional)_ `true` to re-fetch all metadata from MantisBT before answering; default `false`

**Request:** _(summary, from cache)_

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

With `MANTIS_SEARCH_ENABLED=true` the response also contains a `search_index` block:

```json
{
  "projects": 24,
  "tags": 15,
  "byProject": { "3": { "name": "Webshop", "users": 8, "versions": 12, "categories": 4 } },
  "cached_at": "2026-03-27T09:00:00.000Z",
  "ttl_seconds": 82800,
  "search_index": {
    "summary": "312/312 (100 %)",
    "indexed": 312,
    "total": 312,
    "percent": 100,
    "last_synced_at": "2026-03-27T08:55:00+01:00"
  }
}
```

> **Note:** For full lists use `list_projects`, `get_project` (with `include`), or `list_tags`.

---

### Refresh the metadata cache

Forces a fresh fetch of all metadata from MantisBT before returning the summary.

**Tool:** `get_metadata`

**Parameters:**
- `refresh` — `true`

**Request:**

```json
{ "refresh": true }
```

**Response:** same shape as the summary above, with `cached_at` updated to now.

---

### Get the full metadata cache

Returns the complete raw metadata cache as minified JSON. The cache structure is `{ timestamp, projects, byProject: {"<id>": { users, versions, categories }}, tags }`.

**Tool:** `get_metadata`

**Parameters:**
- `detail` — `"full"`

**Request:**

```json
{ "detail": "full" }
```

**Response:**

```json
{
  "timestamp": 1743066000000,
  "projects": [
    { "id": 3, "name": "Webshop", "status": { "id": 10, "name": "development" }, "enabled": true }
  ],
  "byProject": {
    "3": {
      "users": [
        { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com" }
      ],
      "versions": [
        { "id": 21, "name": "2.4.0", "released": false, "obsolete": false }
      ],
      "categories": [
        { "id": 1, "name": "General" },
        { "id": 2, "name": "UI" }
      ]
    }
  },
  "tags": [
    { "id": 1, "name": "regression" },
    { "id": 2, "name": "hotfix" }
  ]
}
```

> **Deprecated:** `get_metadata_full` will be removed in 2.0.0 — use `get_metadata` with `detail: "full"` as shown above.

---

## Version & Diagnostics

### Get versions (MCP server and MantisBT)

Returns the version of this mantisbt-mcp-server and of the connected MantisBT installation in one response. With `check_latest: true` (default) the MantisBT version is compared against the latest release on GitHub (outbound HTTPS, up to 5 s). If MantisBT cannot be reached, `mantis` holds an `error` and the MCP server version is still returned.

**Tool:** `get_version`

**Parameters:**
- `check_latest` — _(optional)_ compare MantisBT against the latest GitHub release; default `true`

**Request:**

```json
{}
```

**Response:**

```json
{
  "mcp_server": { "version": "1.18.0", "commit": "9ebef4c", "built_at": "2026-11-09T12:00:00.000Z" },
  "mantis": {
    "installed_version": "2.27.0",
    "latest_version": "2.27.1",
    "status": "update-available"
  }
}
```

Possible values for `status`: `up-to-date`, `update-available`, `newer-than-release`, `unknown`. Set `check_latest: false` to skip the GitHub comparison.

`mcp_server` describes the running build, not the current `package.json`: `version` is the version it was built from, `commit` the short commit hash (with `-dirty` if there were uncommitted changes), `built_at` the build time. Only a published release reports a plain version; a local build, `npm run dev` or code run straight from `src/` reports e.g. `1.18.0-dev`. Without git, `commit` is left out; code run from `src/` has neither `commit` nor `built_at`.

> **Deprecated:** `get_mcp_version` and `get_mantis_version` will be removed in 2.0.0 — use `get_version` as shown above.

---

### Get the current user

Returns the profile of the user associated with the configured API key. Useful to verify the connection and confirm which account is being used. The `language` field tells you which MantisBT language is configured for this user — use it as a hint for the language to write issue texts and notes in, and expect localized enum labels in that language.

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
  "language": "english",
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

**Fetch behaviour:** Served from the MetadataCache (default TTL 24 h). Falls back to a live API call when the cache is empty. Run `get_metadata` with `refresh: true` to force a refresh.

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

> **Tip:** The `get_issue_schema` tool provides enum values for clients that do not support Resources (and also returns the valid `select` fields).

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

**What happens:** The prompt returns a message that instructs the LLM to call `get_issue_schema` (to resolve valid severity/priority values) and then `create_issue` with the provided data.

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

> To hide all destructive tools at once — e.g. for a session that should never delete anything — set `MANTIS_DISABLE_DESTRUCTIVE=true`; see [Offer only some tool groups](#offer-only-some-tool-groups).

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
