# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.8.0] – 2026-03-27

### Added
- New MCP resource `mantis://projects/{id}`: combined project view with fields (`status`, `view_state`, `access_level`, `description`) plus users, versions, and categories — data that was previously only accessible via separate tool calls. Served from local cache; falls back to three parallel API calls when the cache is cold.
- New tool `find_project_member`: search users with access to a project by name, display name, or email. Case-insensitive substring matching; returns up to `limit` results (default 10, max 100). Served from local cache when fresh; falls back to a live API call otherwise.
- New tool `get_metadata_full`: returns the complete raw metadata cache (all project fields, full user/version/category lists, all tags) as minified JSON. Use when the compact summary from `get_metadata` is not enough.

### Changed
- `get_metadata` now returns a compact summary (project count, tag count, per-project counts of users/versions/categories, cache timestamp, and remaining TTL) instead of the full raw cache dump. Reduces response size from hundreds of KB to a few hundred bytes. Use `list_projects` for the full project list, `get_project_users` / `get_project_versions` / `get_project_categories` for per-project data, and `list_tags` for tags.
- `list_projects` now applies the same normalization as `sync_metadata`: `custom_fields` and other undeclared API fields are stripped from project objects, keeping the response lean and consistent.

### Fixed
- `mantis://projects` resource response reduced from ~270 KB to ~6 KB (98% smaller): `custom_fields` are no longer included in project objects (they were passed through from the raw MantisBT API response despite not being part of the project schema), JSON output is now minified, and enum sub-objects (`status`, `view_state`, `access_level`) are stripped to only their declared fields. The `label` field on `status` and `view_state` is preserved for localized display name lookups.

---

## [1.7.0] – 2026-03-26

### Added
- `create_issue`: new optional parameters `version`, `target_version`, `fixed_in_version`, `steps_to_reproduce`, `additional_information`, `reproducibility`, and `view_state` — these fields were already supported by the MantisBT REST API on issue creation but were missing from the tool, requiring a second `update_issue` call to set them.

---

## [1.6.2] – 2026-03-24

### Fixed
- `create_issue`: default priority is now `"normal"`, matching the MantisBT UI default. Previously no priority was sent when omitted, causing MantisBT to fall back to its server-side default of `"low"`.
- `create_issue`: `description` is now a required field (minimum 1 character). Previously it defaulted to an empty string, which caused the MantisBT API to reject the request. The validation error is now surfaced immediately by the MCP server before the API is called.

### Changed
- npm keywords extended: added `issue-tracker`, `bug-tracker`, `claude`, `claude-code` for better discoverability.

---

## [1.6.1] – 2026-03-24

### Changed
- `repository.url` in package.json switched from Codeberg to GitHub mirror
  for ecosystem compatibility (LobeHub, npm crawlers). Codeberg remains the
  canonical source (see `homepage`).

---

## [1.6.0] – 2026-03-22

### Added
- Three MCP Resources for direct URI-addressable data access (read-only; less widely supported by clients than tools):
  - `mantis://me` — profile of the authenticated API user (live fetch of `GET /users/me`)
  - `mantis://projects` — all accessible MantisBT projects (cache-backed via MetadataCache; refresh with `sync_metadata`)
  - `mantis://enums` — valid values for all issue enum fields (severity, priority, status, resolution, reproducibility); live fetch
- Four MCP prompt templates for guided issue workflows:
  - `create-bug-report` — structured bug report prompt; collects project, category, summary, description, steps to reproduce, expected/actual behavior, and environment, then calls `create_issue`
  - `create-feature-request` — feature request prompt; collects project, category, summary, description, and use case, then calls `create_issue`
  - `summarize-issue` — calls `get_issue` for a given issue ID and returns a concise summary
  - `project-status` — calls `list_issues` for a given project and produces a status report grouped by severity
- LobeHub marketplace badge added to README.md and README.de.md

### Removed
- Config file fallback (`~/.claude/mantis.json`): credentials must now be provided via environment variables (`MANTIS_BASE_URL`, `MANTIS_API_KEY`). The fallback was an internal migration aid with no value for external users.

### Changed
- Credential loading is now deferred to the first tool invocation. The server starts and responds to `tools/list` even when `MANTIS_BASE_URL` and `MANTIS_API_KEY` are not configured; the configuration error is surfaced when a tool is actually called. This enables marketplace validators (e.g. LobeHub) to probe the server without requiring credentials.

---

## [1.5.9] – 2026-03-20

### Fixed
- `create_issue` now validates `severity` and `priority` against canonical English names and returns a clear error for unknown values; sends `{ id }` instead of `{ name }` to work correctly on localized MantisBT installations

### Added
- Cookbook (EN + DE): tool-oriented recipes with copy-paste-ready parameter examples for all registered tools ([docs/cookbook.md](docs/cookbook.md), [docs/cookbook.de.md](docs/cookbook.de.md))
- Usage examples (EN + DE): natural language prompt examples for everyday use cases ([docs/examples.md](docs/examples.md), [docs/examples.de.md](docs/examples.de.md))
- README: documentation section linking to cookbook and examples

---

## [1.5.8] – 2026-03-18

### Added
- Glama MCP directory badge in README.md and README.de.md (contributed by Frank Fiegel / punkpeye)

---

## [1.5.7] – 2026-03-18

### Added
- `glama.json`: Glama MCP directory metadata (maintainer claim)
- CI: GitHub release step in publish workflow (creates GitHub release alongside Codeberg release on tag push)

### Fixed
- `server.json`: removed `repository` field — Codeberg URL rejected by MCP Registry validation

---

## [1.5.6] – 2026-03-18

### Added
- `server.json`: MCP Registry metadata for publishing to the official MCP Registry (registry.modelcontextprotocol.io)
- `package.json`: `mcpName` field (`io.github.dpesch/mantisbt-mcp-server`) required by the MCP Registry publisher
- `.gitignore`: exclude `mcp-publisher.exe` and `.mcpregistry_*` token files

---

## [1.5.5] – 2026-03-18

### Fixed
- Semantic search index sync: eliminated O(n²) disk write amplification during initial index builds. Previously `addBatch()` wrote the entire `index.json` to disk after every batch, causing n/batch_size complete rewrites for a full rebuild. Now `addBatch()` only updates the in-memory map; a new `flush()` method (atomic write via tmp file + rename) persists to disk. `SearchSyncService.sync()` calls `flush()` as a checkpoint every 100 indexed issues (`CHECKPOINT_INTERVAL=100`), limiting data loss on process kill to at most 100 issues, and performs a final flush after the loop for any remaining items.

---

## [1.5.4] – 2026-03-18

### Fixed
- `registerFileTools`: the `uploadDir` parameter was typed as required (`string | undefined`) instead of truly optional (`uploadDir?: string`), causing TypeScript errors in callers that omit the argument and breaking the CI typecheck step.

### Changed
- Added `npm run init` setup script (`scripts/init.mjs`): checks Node.js version (≥ 18), runs `npm install`, installs git hooks from `scripts/hooks/`, and runs a typecheck to verify the setup.
- Git pre-push hook logic is now version-controlled in `scripts/hooks/pre-push.mjs`; the hook runs `npm run typecheck` before every push to catch type errors locally before they reach CI.

---

## [1.5.3] – 2026-03-17

### Security
- Removed unused `vectra` dependency. The package was listed in `dependencies` but never imported — `VectraStore` is a self-contained implementation. Removing it eliminates three transitive CVEs in the `openai` → `axios` chain (GHSA-jr5f-v2jv-69x6 SSRF/credential-leakage, GHSA-43fc-jf86-j433 DoS, GHSA-wf5p-g6vw-rhxx CSRF).
- `upload_file`: new optional `MANTIS_UPLOAD_DIR` environment variable restricts `file_path` uploads to a configured directory. When set, any path that resolves outside the directory (including `../` traversal attempts) is rejected before the file is read. Without the variable the behaviour is unchanged (no restriction). The resolved directory prefix is computed once at server start, not per request.
- HTTP transport now binds to `127.0.0.1` (localhost only) by default instead of `0.0.0.0` (all interfaces). This prevents unintended exposure on network interfaces when the server is started without explicit network configuration. Set `MCP_HTTP_HOST=0.0.0.0` to restore the previous behaviour (required for Docker and remote access).
- New optional `MCP_HTTP_TOKEN` environment variable: when set, the `/mcp` endpoint requires an `Authorization: Bearer <token>` header. Requests without a valid token receive HTTP 401. The `/health` endpoint remains public regardless of this setting.
- New optional `MCP_HTTP_HOST` environment variable: overrides the bind address for HTTP mode (default: `127.0.0.1`).
- `update_issue`: the `fields` parameter now validates against an explicit allowlist of known MantisBT field names (`summary`, `description`, `steps_to_reproduce`, `additional_information`, `status`, `resolution`, `priority`, `severity`, `reproducibility`, `handler`, `category`, `version`, `fixed_in_version`, `target_version`, `view_state`, `tags`, `custom_fields`); unknown keys are rejected with a validation error. Reference objects (`status`, `handler`, `reproducibility`, `version`, `view_state`, etc.) must now contain at least `id` or `name` — empty objects `{}` are rejected. Previously any key was accepted and forwarded directly to the API.

---

## [1.5.2] – 2026-03-17

### Fixed
- Semantic search: stdio server processes no longer accumulate as zombie processes after the Claude session ends. Previously, a background index sync kept the Node.js event loop alive indefinitely after stdin was closed, causing a new process to pile up on every session start. The server now exits immediately when stdin closes.

---

## [1.5.1] – 2026-03-17

### Fixed
- Semantic search: ONNX thread pool now defaults to 1 thread (`intra_op_num_threads=1`) instead of auto-detecting all available CPU cores. On WSL and multi-core machines the unrestricted default caused CPU saturation (700%+ CPU, 12 GB VM) during the initial index build. The number of threads is configurable via the new `MANTIS_SEARCH_THREADS` environment variable (default: `1`). `inter_op_num_threads` is always kept at 1 because Transformer model graphs are sequential and inter-op parallelism provides no benefit.

---

## [1.5.0] – 2026-03-17

### Added
- `create_issue`: always returns the complete issue object. Older MantisBT versions returned only `{ id: N }` on `POST /issues`; the tool now detects this and performs an automatic `GET /issues/{id}` to retrieve the full issue. If that fetch fails the minimal object is returned instead (the issue was already created).
- `get_issue_enums`: each entry now includes an optional `canonical_name` field containing the standard English API name (e.g. `"minor"`, `"block"`) when the returned `name` differs from it. This occurs on localized MantisBT installations where enum values have been customized at the database level (e.g. `name: "kleinerer Fehler"` instead of `"minor"`). The field is omitted when `name` already matches the canonical value and for custom entries without a known canonical name. Available for all five enum groups (severity, status, priority, resolution, reproducibility).
- `create_issue`: new optional `handler` parameter accepts a username string as alternative to `handler_id`. The server resolves the name against the project members list (from the metadata cache when available, otherwise via a direct API call). If the username is not found, an error is returned with a list of available users.
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
