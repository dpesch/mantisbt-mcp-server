# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- `add_relationship`: new optional `type_name` parameter accepts string names as alternative to the numeric `type_id` (e.g. `"related_to"`, `"duplicate_of"`, `"depends_on"`, `"blocks"`). Dash variants (`"related-to"`) are also accepted. `type_id` becomes optional — at least one of the two must be provided; `type_id` takes precedence when both are given.
- `search_issues`: new optional `select` parameter. When provided, each matching issue is fetched from MantisBT and the response is enriched with the requested fields (comma-separated, e.g. `"id,summary,status,handler,priority"`). Without `select` the behaviour is unchanged — only `id` and `score` are returned. `id` and `score` are always included regardless of the `select` value. If an individual issue fetch fails, that result falls back silently to `{id, score}`.

---

## [1.4.0] – 2026-03-17

### Added
- `get_issue_enums` now includes a `label` field in each enum entry when it differs from `name`. On localized MantisBT installations (e.g. German UI) this provides a translation table from the UI language back to the API name/id: `{"id": 10, "name": "new", "label": "Neu"}`. When `label` and `name` are identical the field is omitted to keep the output compact. The tool description also clarifies that `name` may itself be localized on installations where enum values have been customized at the database level.

### Fixed
- `list_issues`: `assigned_to`, `reporter_id`, and `status` filters now reliably return matching issues regardless of the requested `page_size`. Previously, the tool fetched exactly `page_size` items from the API before filtering — so a small `page_size` combined with an active filter returned zero results if the matching issues were not at the top of the unfiltered list. The tool now internally fetches batches of 50 (API maximum) and scans up to 500 issues until enough matching results are found. All filter parameters are still forwarded to the API as a hint for installations that support server-side filtering.

---

## [1.3.1] – 2026-03-16

### Fixed
- `get_issue_enums` returned an empty object `{}` on MantisBT 2.x installations. The MantisBT REST API returns enum config values as pre-parsed `[{id, name, label}]` arrays, not as legacy `"id:name,..."` strings. The handler now covers both formats; the `label` field is stripped from the output.

---

## [1.3.0] – 2026-03-16

### Added
- New tool `get_search_index_status`: returns the current fill level of the semantic search index — how many issues are indexed vs. total, plus the timestamp of the last sync. Only active when `MANTIS_SEARCH_ENABLED=true`.
- New tool `get_issue_enums`: returns structured ID/name pairs for all issue enum fields (severity, status, priority, resolution, reproducibility) — ready for direct use in `create_issue` / `update_issue` without requiring knowledge of MantisBT-internal config option names.
- `sync_metadata` now fetches and caches all tags globally (`tags` field at root level of the cached metadata). When the dedicated `GET /tags` endpoint is unavailable (MantisBT < 2.26), tags are collected by scanning all issues across all projects (`select=id,tags`).
- New tool `get_mcp_version`: returns the version of the running mantisbt-mcp-server instance.

### Fixed
- `list_tags` now falls back to the metadata cache when `GET /tags` returns 404 instead of returning an error. Run `sync_metadata` first to populate the cache.
- Numeric ID parameters now accept string inputs (e.g. `"1940"`) — MCP clients that pass IDs as strings no longer receive error -32602.
- `create_issue` now always sends a `severity` to MantisBT (default: `"minor"`). Previously omitting severity caused MantisBT to store `0`, which was displayed as `@0@`.
- `get_search_index_status` now correctly reports the total issue count on MantisBT installations that do not return `total_count` in the issues list API. The total is persisted after every sync: `total_count` from the API takes precedence, otherwise the current store size is used as a best-effort estimate. The status tool will therefore no longer show "total unknown" after any sync has completed.
- `sync_metadata` tags endpoint failure now degrades gracefully to an empty array instead of propagating an error.
- `sync_metadata` now correctly populates `byProject[id].categories`.
- `sync_metadata` now fetches all versions including obsolete and inherited ones (`obsolete=1&inherit=1`). Previously only non-obsolete versions were returned, causing the version count in the cache to be far too low.
- `get_project_versions` now accepts optional `obsolete` and `inherit` boolean parameters to include obsolete and/or inherited versions (both default to `false`). Previously the wrong endpoint (`projects/{id}/categories`) was called, which returned an empty array on many installations. Categories are now read from the project detail response (`projects/{id}`), identical to the source used by `get_project_categories`.

---

## [1.2.0] – 2026-03-16

### Added
- New tool `remove_relationship`: removes a relationship from an issue. The `relationship_id` is the numeric `id` field on the relationship object returned by `get_issue` (not the type id).
- New tool `remove_monitor`: removes a user as a monitor of an issue by username.
- New tool `upload_file`: uploads a file to an issue via multipart/form-data. Supports two input modes: a local `file_path` (filename derived from path) or Base64-encoded `content` with an explicit `filename`. Optional parameters: `filename` (overrides derived name), `content_type` (default: `application/octet-stream`), `description`.
- New optional semantic search module (`MANTIS_SEARCH_ENABLED=true`): indexes all MantisBT issues as local vector embeddings using `@huggingface/transformers` (ONNX, no external API required). Two new tools:
  - `search_issues` — natural language search over all indexed issues, returns top-N results by cosine similarity score.
  - `rebuild_search_index` — build or incrementally update the search index; `full: true` clears and rebuilds from scratch.
  - Vector store: `vectra` (pure JS, default) or `sqlite-vec` (optional, requires manual installation).
  - Incremental sync on every server start via `updated_at` timestamp.
  - Configuration: `MANTIS_SEARCH_ENABLED`, `MANTIS_SEARCH_BACKEND`, `MANTIS_SEARCH_DIR`, `MANTIS_SEARCH_MODEL`.

### Fixed
- `list_issues` recorded-fixture tests were fragile: status filter counts are now derived dynamically from the fixture instead of hardcoded assumptions.

---

## [1.1.0] – 2026-03-15

### Added
- `list_issues`: new optional `select` parameter — passes a comma-separated field list to the MantisBT `select` query parameter for server-side field projection. Significantly reduces response size when only a subset of fields is needed (e.g. `"id,summary,status,priority,handler,updated_at"`).
- `list_issues`: new optional `status` parameter — client-side filter by status name (e.g. `"new"`, `"assigned"`, `"resolved"`) or the shorthand `"open"` for all statuses with id < 80. Note: applied after fetching, so a page may contain fewer results than `page_size` when active.
- New tool `get_issue_fields`: returns all field names valid for the `select` parameter. Fetches a sample issue to reflect the server's active configuration, merges with fields MantisBT omits when empty (notes, attachments, etc.), and caches the result.

---

## [1.0.3] – 2026-03-15

### Fixed
- CI badge reverted to Codeberg native URL (shields.io Gitea endpoint returned 404)

### Changed
- CI workflow skips duplicate run on branch push for release commits

---

## [1.0.2] – 2026-03-15

### Changed
- CI badge switched to shields.io for correct rendering on npmjs.com
- Publish workflow now depends on CI passing (`needs: ci`) before releasing

---

## [1.0.1] – 2026-03-15

### Added
- Gitea Actions CI workflow: typecheck, tests, build on every push
- Gitea Actions publish workflow: automatic npm publish and Codeberg release on version tags

### Changed
- README badges: added CI status, npm version, and license badges

---

## [1.0.0] – 2026-03-15

First stable release.

### Added

**Issues**
- `get_issue` — retrieve an issue by numeric ID
- `list_issues` — filter issues by project, status, author, page, and page size
- `create_issue` — create a new issue
- `update_issue` — update an existing issue
- `delete_issue` — delete an issue

**Notes**
- `list_notes` — list notes of an issue
- `add_note` — add a note to an issue
- `delete_note` — delete a note

**Attachments**
- `list_issue_files` — list attachments of an issue

**Relationships**
- `add_relationship` — create a relationship between two issues

**Monitors**
- `add_monitor` — add yourself as a monitor of an issue

**Tags**
- `list_tags` — list all available tags
- `attach_tags` — attach tags to an issue
- `detach_tag` — remove a tag from an issue

**Projects**
- `list_projects` — list all accessible projects
- `get_project_versions` — get versions of a project
- `get_project_categories` — get categories of a project
- `get_project_users` — get users of a project

**Metadata & System**
- `get_metadata` — retrieve cached metadata (projects, users, versions, categories)
- `sync_metadata` — refresh the metadata cache
- `list_filters` — list saved filters
- `get_current_user` — retrieve your own user profile
- `list_languages` — list available languages
- `get_config` — show server configuration (base URL, cache TTL)
- `get_mantis_version` — get MantisBT version and check for updates on GitHub

**Infrastructure**
- stdio and HTTP transport (Streamable HTTP)
- Metadata cache with configurable TTL (default: 1 hour)
- Config file fallback (`~/.claude/mantis.json`)
- `VersionHintService`: appends update hint to API error messages
- Vitest test suite with 73 unit and fixture-based tests
- MIT license, `CONTRIBUTING.md`, `README.md`

### Fixed
- `get_project_categories` was calling `/projects/{id}/categories` (does not exist in MantisBT) — corrected to `GET projects/{id}` with extraction of `.projects[0].categories`

[1.0.0]: https://codeberg.org/dpesch/mantisbt-mcp-server/releases/tag/v1.0.0
