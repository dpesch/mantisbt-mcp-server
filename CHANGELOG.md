# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Documentation

- mcprush directory badge added to README.md and README.de.md
- New "Security considerations" section in the README (#8636): issue and note texts are untrusted input that a prompt injection can use to drive write tools. `MANTIS_UPLOAD_DIR` is now recommended in stdio mode as well and appears in the installation examples, because without it `upload_file`'s `file_path` can read any file the server process can read. The section also points to `MANTIS_TOOLSETS`, `MANTIS_DISABLE_DESTRUCTIVE` and the tool annotations.

### Deprecated

- `upload_file`'s `file_path` without `MANTIS_UPLOAD_DIR` in stdio mode: starting with 2.0.0, `file_path` is disabled in stdio mode too unless `MANTIS_UPLOAD_DIR` is set (#8637). Uploads via `content` (Base64) are not affected.

### Security

- Updated dependencies with known vulnerabilities: `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7, and through the SDK `proxy-addr` 2.0.8, `body-parser`, `hono`, `@hono/node-server`, `fast-uri`, `ip-address` and `qs`. `npm audit` reports no vulnerabilities.

---

## [1.18.2] – 2026-11-11

### Added

- `MCP_HTTP_MAX_BODY_SIZE` sets the largest accepted `/mcp` request body in bytes, default 64 MB (#8631). An empty value counts as unset. In HTTP mode, any other value that is not a positive whole number stops the server at startup; stdio ignores it.

### Security

- `search_issues` with `select`: when MantisBT refused an issue (401, 403) or no longer had it (404), the result still came back with `highlights` taken from the local search index — text of an issue the API user may no longer read (#8617). Such results are now left out. Other errors (network, 5xx) keep the previous fallback to the indexed text.
- `upload_file` with `MANTIS_UPLOAD_DIR`: the directory check looked only at the path as written, while the read followed symbolic links (#8618). A link inside the upload directory could therefore upload a file from anywhere the server can read. The check now resolves links and compares the real target, and the server reads that target. A link swapped in between check and read is still not caught — keep the upload directory unwritable for less trusted users.
- `MANTIS_DISABLE_DESTRUCTIVE=true` hid `remove_monitor`, but `update_issue` could still remove monitors through `remove_monitors` (#8621). `update_issue` now rejects `remove_monitors` in that mode, before anything is changed; `add_monitors` keeps working.
- `update_issue` with `fields.notes`: the check for repeated note IDs took quadratic time and ran before any access check, so a request with many note edits could block the server (#8622). It now takes a single pass, and each repeated ID appears once in the error message.
- `search_issues`: the exact-match ranking scanned issue texts once per identifier in the query, with no limit, so a long query full of identifiers could block the server (#8623). It now looks at no more than 32 identifiers, checks no more than 10,000 issue texts per query and starts with the rarest identifier. The limits sit well above what real queries need, so their results do not change.
- HTTP transport: `POST /mcp` read the whole request body into memory, however large (#8624). Bodies above 64 MB are now refused with `413 Payload Too Large` and the connection is closed. The limit leaves room for `upload_file` with `content`: files up to about 48 MB still fit as Base64.
- Metadata cache and search index were shared by every configuration using the same directory, so one account could see projects, members and issues cached for another (#8625). Both now live in a subdirectory per base URL and API key (host name plus hash, never the key itself), also under an explicit `MANTIS_SEARCH_DIR`; see the README. The server logs the paths on startup. **The search index is rebuilt once after the update**, and again after an API key change. Old files directly in `MANTIS_CACHE_DIR` or `MANTIS_SEARCH_DIR` are no longer read: delete them, or move them into the new subdirectory to skip the rebuild if only one configuration ever used them. After a key change, the folder of the old key can be deleted as well.
- Search index: the incremental sync only added and updated issues, so issues deleted in MantisBT or no longer visible to the account stayed in the index for good, and `search_issues` kept returning them (#8626). A sync over all projects now lists the issue IDs the account can see (about 1 s for 7,800 issues) and removes the others; `rebuild_search_index` reports them as `removed`. A sync limited to `project_id` removes nothing, and neither does a listing that does not finish.

---

## [1.18.1] – 2026-11-10

### Fixed

- `get_project` and `get_project_versions`: `obsolete: true` returned no obsolete versions, and `inherit: true` no versions of parent projects (#8614). Without the IDs of obsolete versions, `update_version` could not reach them. The cause lies in MantisBT: the REST handler of `GET /projects/{id}/versions` drops these query parameters, so the endpoint always returns the project's own, active versions (known upstream as [mantisbt #34578](https://mantisbt.org/bugs/view.php?id=34578), unfixed as of MantisBT 2.28.4; fix proposed in [mantisbt PR #2313](https://github.com/mantisbt/mantisbt/pull/2313)). With `obsolete` or `inherit` set, the server now also reads `GET /projects`, which embeds every version of a project and gives the project hierarchy; without `inherit`, versions of parent projects are left out — unless the API user cannot see the parent project, in which case they cannot be told apart and stay in. The metadata cache (`get_metadata`) and the `mantis://projects/{id}` resource held the same gap and now contain obsolete and inherited versions too; refresh an existing cache with `get_metadata(refresh: true)`. The cache sync now takes the versions from `GET /projects` and no longer sends one `/versions` request per project. Without either parameter, `get_project` and `get_project_versions` behave as before and make no extra request.
- `list_projects`, `get_project` and the `mantis://projects` resources never returned `subprojects`, although `get_project` lists the field (#8616). MantisBT sends it in camelCase as `subProjects`, which the server did not read. `subprojects` now holds the direct subprojects as `{ id, name }` references, the form MantisBT provides; projects without subprojects keep omitting the field. Refresh an existing metadata cache with `get_metadata(refresh: true)`.

---

## [1.18.0] – 2026-11-09

### Deprecated

- The default of `response` in `update_issue` and `create_issue` changes from `"full"` to `"short"` in 2.0.0. Callers that rely on the whole issue in the response should pass `response: "full"` explicitly.

### Added

- `update_issue` and `create_issue`: optional `response` parameter. `"short"` returns only what confirms the change instead of the whole issue with description, notes and history (#8598) — for `update_issue` `id`, `summary`, `status`, `resolution`, `updated_at`, `view_url` and the changed fields (custom fields and edited notes narrowed to the changed entries, an appended note to `id` and `view_url`); for `create_issue` `id`, `summary`, `project`, `category`, `status`, `handler`, `created_at` and `view_url`. On a fresh demo issue that is 529 instead of 4,046 characters; on an issue with many notes the gap is far larger. The default stays `"full"`.
- `get_version`: `mcp_server` now also contains `commit` (short hash of the build, `-dirty` with uncommitted changes) and `built_at` (build time), so an outdated build shows even when its version number is right (#8547).

### Fixed

- The server reported the version from `package.json` at runtime, not the one its code was built from — in the MCP handshake, `get_version`, `get_mcp_version`, the startup log and the HTTP `/health` endpoint. Between a version bump and `npm run build`, a local install therefore claimed the new version while running the old code (#8547). The build now writes `dist/build-info.json`, and the server reads its version from there. Only the release build in CI reports a plain version; every other build — a local `npm run build`, `npm run dev`, code run from `src/` — is marked `-dev`, e.g. `1.18.0-dev`. `npm publish` refuses any build that is not the release build of the package version (`prepublishOnly`). The npm package was not affected: it is always built right before publishing.
- `list_issues`: the client-side filters `status`, `assigned_to`, `reporter_id`, `updated_after`/`updated_before` and `created_after`/`created_before` returned an empty list when `select` did not contain the field they read (`status`, `handler`, `reporter`, `updated_at`, `created_at`). The `select` projection removed the field before the filter ran, so every issue failed it — silently, without an error (#8597). The fields a filter needs are now fetched as well and removed again after filtering, so the response still holds exactly the selected fields. `group_by` was not affected.

---

## [1.17.0] – 2026-11-03

### Added

- Search benchmark: an exact-first measure for identifier queries (do all issues that contain the identifier lead the top 10?), a new `compound` query type for identifiers such as `CVE-2026-1234`, and fixed cases from `BENCHMARK_EXACT` that print their ranking.

### Changed

- Semantic search: `search_issues` lists every issue that contains an identifier from the query as a whole — an order number, a CVE, a version, a code name such as `MANTIS_SEARCH_DIR` or `getEmbeddingSignature` — before all issues that do not. The combined ranking found such issues, but put issues in between that were only close by meaning, often short ones (#8545). A query for `CVE-2026-1234` no longer counts an issue with another CVE of 2026 as a near match, and `1.15` does not match `1.15.2`. Identifiers are recognised by their form (underscore, inner capital, letters with digits, five or more digits, or words joined by `-` `.` `:` `/` with a digit), so plain words and short numbers such as "Android 15" keep the combined ranking; an identifier found in more than 20 issues does as well. Measured on 7,742 issues: for a rare identifier, all issues containing it now lead the top 10 in 97 % of the queries instead of 72 %; for a compound identifier such as `7.0.0-1014-azure` in 98 % instead of 11 %, and such a query finds its issue among the top 10 in 98 % instead of 64 %. Titles, sentences and paraphrases stay level or gain slightly. No index rebuild is needed.

---

## [1.16.0] – 2026-11-02

### Added

- Search benchmark `npm run benchmark:search` (`scripts/benchmark-search.ts`): measures recall@10 of `search_issues` on an existing index for exact titles, first sentences, sentences from deep in long descriptions, rare identifiers and — from `BENCHMARK_PARAPHRASES` — hand-written paraphrases, ranked by vectors only and hybrid. Reads the index only; refuses one built with another embedding signature.

### Changed

- Semantic search: `search_issues` now combines the semantic ranking with a keyword ranking (BM25 over summary and description, summary counted twice) by Reciprocal Rank Fusion. Embeddings blur exact terms; a query for an identifier that occurs in at most three issues found its issue among the top 10 in 26 % of the cases, now in 100 % (7,739 issues). Literal queries gain as well — exact titles 97 % → 99.8 %, first sentences 83 % → 99 %, sentences from deep in a long description 58 % → 97 % — while paraphrased queries stay level (38 % → 37 %, 60 queries). `score` is still the semantic similarity, but results are now ordered by the combined ranking, so a keyword match can precede a higher `score`. The keyword index is built in memory on the first search (about 0.1 s and 7 MB for 7,739 issues) and adds about 2 ms per search.
- Semantic search: a long description is now split into up to 8 chunks of the model's token limit, each embedded together with the summary, and an issue scores by its best chunk. Details deep in a long description become findable (measured without the keyword ranking above): a sentence from the middle of a long description found its issue among the top 10 in 58 % of the cases instead of 13 % (7,739 issues); exact titles 97 % (before 96 %), first sentences 83 % (before 84 %). The index grows to about 1.7 vectors per issue — `index.json` from 67 to 113 MB for 7,739 issues, held in memory by every server process with search enabled. Further chunks are stored in a new optional `chunks` field next to `vector`, so a server of an older version can still read the index.

### Fixed

- Semantic search: `search_issues` often missed issues with a longer description, even when queried with their exact title. The default model is trained on 128 tokens, but the text was embedded with up to 512, so the vectors of long issues collapsed into one another and short issues won almost every query. Text is now cut at the model's training length. On an index of 7,930 issues, an exact-title query found the issue among the top 10 in 95 % of the cases instead of 47 %, a query with the first sentence of the description in 84 % instead of 38 %. Text beyond that limit goes into further chunks (see Changed).
- Semantic search: the index is rebuilt automatically when it was made with another embedding model or token limit, including the first start after this update. Before, changing `MANTIS_SEARCH_MODEL` kept the old vectors, which cannot be compared with the new ones, until a `rebuild_search_index` with `full: true`. The model and token limit are stored in `embedding_signature.txt` in the search directory. The rebuild runs in the background sync of the first server start and takes about 6 minutes for 7,700 issues with the default of 1 thread (see below); until it is done, `search_issues` finds only the issues indexed so far. It also drops entries of issues that were deleted or are no longer visible, which an incremental sync never removes.
- Semantic search: `MANTIS_SEARCH_THREADS` had no effect since it was introduced in 1.5.1 — the embedding model always used every CPU core. The thread options were passed in snake_case (`intra_op_num_threads`), which onnxruntime silently ignores; it expects `intraOpNumThreads`. The documented default of 1 thread now applies, as intended against CPU saturation on WSL and multi-core machines. Embedding is about three times slower with 1 thread than with all cores; a full rebuild of 7,700 issues takes about 6 minutes instead of 2.5. With `MANTIS_SEARCH_THREADS=4` the rebuild took 160 s instead of 377 s with 1 thread; 4 is a good value on a machine with 4 or more cores.

---

## [1.15.0] – 2026-10-31

### Deprecated

- `add_monitor` — use `update_issue` with `add_monitors` instead; `add_monitor` will be removed in 2.0.0.
- `remove_monitor` — use `update_issue` with `remove_monitors` instead; `remove_monitor` will be removed in 2.0.0.
- `get_issues` — use `get_issue` with `ids` instead; `get_issues` will be removed in 2.0.0.
- `list_notes` — use `get_issue` with `select: "notes"` instead; `list_notes` will be removed in 2.0.0.
- `list_issue_files` — use `get_issue` with `select: "attachments"` instead; `list_issue_files` will be removed in 2.0.0.
- `get_project_categories`, `get_project_users`, `get_project_versions` — use `get_project` with `include: ["categories"]`, `["users"]` or `["versions"]` instead; they will be removed in 2.0.0.
- `find_project_member` — use `get_project` with `member_query` instead; `find_project_member` will be removed in 2.0.0. Unlike `find_project_member`, `get_project` has no `limit` and returns all matching users.
- `get_metadata_full` — use `get_metadata` with `detail: "full"` instead; `sync_metadata` — use `get_metadata` with `refresh: true`; `get_search_index_status` — use `get_metadata` (field `search_index`). All three will be removed in 2.0.0.
- `get_mcp_version`, `get_mantis_version` — use `get_version` instead; they will be removed in 2.0.0.
- `get_issue_fields`, `get_issue_enums` — use `get_issue_schema` instead; they will be removed in 2.0.0. The resource `mantis://enums` stays.
- `list_languages` — use `get_current_user` (field `language`) instead; `list_languages` will be removed in 2.0.0. Despite its name it never listed languages: MantisBT's `GET /lang` returns only the current user's language.
- `release_version` — use `update_version` with `released: true`, `timestamp`, and optionally `next_version` instead; `release_version` will be removed in 2.0.0.

### Added

- `update_issue` accepts two new optional parameters `add_monitors` and `remove_monitors` (arrays of MantisBT login names, case-insensitive). `fields` may now be omitted when only monitor changes or a note are given. The response contains a `monitors` key with `added?`, `removed?`, `not_monitoring?`, and `current`. The steps run in order — fields, monitors, note. Once one of them succeeded, a later failure is reported inline (`monitors_error`, `note_error`) instead of failing the call, so changes that went through are not retried; only when every requested step failed does the call return an error. A user in both lists is rejected; a call with nothing to change is rejected. `dry_run` additionally shows `would_add_monitors` / `would_remove_monitors`.
- `update_issue` can edit existing notes: `fields.notes` takes `[{ id, text?, view_state? }]`. MantisBT has no REST route for editing a note, but its issue update applies note edits by ID. Note edits keep the note's current visibility unless `view_state` is given — the tool reads the current `view_state` first and sends it along. Note IDs that do not belong to the issue are rejected before anything is written. After the update the tool checks text and visibility in the response and reports edits MantisBT did not apply as `notes_error` (or as an error when the notes were the only field). `dry_run` shows the edit including the filled-in `view_state`. New notes are still added with the `note` parameter or `add_note`; no new tool.
- `get_issue` accepts `ids` (1–50 issue IDs) as an alternative to `id` — pass exactly one of the two. With `ids` the response is `{ issues, requested, found, failed }` as with `get_issues`, missing or inaccessible IDs give `null` at their position; `select` applies to every issue, and `view_url` is set even when `select` leaves out `id`.
- New tool `get_project`: master data of one project plus, on request, its categories, users and versions in one call. `include` takes any of `"categories"`, `"users"`, `"versions"`; `access_level` and `member_query` (case-insensitive substring search in login name, real name and email — all matches are returned) imply `"users"`, `obsolete` and `inherit` imply `"versions"`. Categories come without the `[All Projects] ` prefix and cost no extra request. Users come from the metadata cache when it is fresh and no `access_level` is given.
- Attachments in `get_issue` and `list_issue_files` now carry a `download_url`.
- `get_metadata` accepts `detail` (`"summary"`, the default and previous behaviour, or `"full"` for the complete raw cache) and `refresh` (`true` re-fetches all metadata first). With semantic search enabled the response also contains a `search_index` block (indexed, total, percent, last sync).
- New tool `get_version`: version of this MCP server and of the connected MantisBT installation in one response, `{ mcp_server: { version }, mantis: { installed_version, latest_version?, status? } }`. `check_latest` (default `true`) compares MantisBT with its latest GitHub release. If MantisBT cannot be reached, `mantis` holds an `error` and the MCP server version is still returned.
- New tool `get_issue_schema` (`project_id` optional): the valid `select` fields and the enum values (severity, status, priority, resolution, reproducibility) in one response.
- `list_issues` accepts `group_by` (`"status"`, `"handler"`, `"priority"`, `"category"`): the server counts all matching issues itself and returns `{ group_by, total, groups: [{ id, name, label?, count }] }` instead of an issue list. All filters still apply; `page`, `page_size` and `select` are ignored. Issues without a handler are counted as `"(unassigned)"`. The server pages through MantisBT 1,000 issues at a time with only the fields it needs (about 1 s for 7,700 issues); if it stops at its limit of 50,000 issues, the response says `"truncated": true`.
- `list_issues` with client-side filters (`status`, `assigned_to`, `reporter_id`, date filters) now says `"truncated": true` when its scan limit of 500 issues ended the search before the requested page was full. Before, such a page simply came back short without a hint.
- Token benchmark `npm run benchmark` (`scripts/benchmark-tokens.ts`): measures the response sizes of typical tasks with and without the server doing the work, against a live MantisBT (`BENCHMARK_PROJECT_ID`, `BENCHMARK_ISSUE_IDS`).
- New env var `MANTIS_TOOLSETS`: a comma-separated list of tool groups to offer — `issues`, `notes`, `links`, `files`, `projects`, `versions`, `meta`, `search` (case-insensitive). Unset or empty means all groups, as before. A deprecated tool belongs to the group of its replacement (e.g. `list_notes` to `issues`). The `search` group additionally needs `MANTIS_SEARCH_ENABLED=true`; without the group the search module is not started at all. An unknown group name stops the server at startup with a message listing the valid names.
- New env var `MANTIS_DISABLE_DESTRUCTIVE=true`: hides every tool marked as destructive — `delete_issue`, `delete_note`, `delete_version`, `remove_relationship`, `remove_monitor` — regardless of the groups.
- `get_current_user` now describes its fields and points out `language` — the user's MantisBT language, as a hint for the language of issue texts and notes.
- `update_version` accepts a new optional `next_version` parameter (only allowed together with `released: true`): creates a follow-up version in the same call. With `next_version` the response is `{ version: <updated>, next_version: <created> }` — or `{ version, next_version_error: <message> }` when creating the follow-up fails (the update itself stays in effect). Without `next_version` the response is unchanged (the updated version object).

### Fixed

- Semantic search: the server no longer loads the whole vector index before it starts answering. On startup it read and parsed `index.json` only to count its entries — a number it needs only when `last_total.txt` is missing. With an index of about 70 MB (8,000 issues) the server is now ready roughly 0.2 s sooner on every session start; the background sync still loads the index afterwards.
- `list_issue_files` promised a `download_url` per attachment, but MantisBT sends it only via SOAP, never via REST. The server now builds it (`file_download.php?file_id=…&type=bug`), for `get_issue` as well.
- `update_issue` returned the raw MantisBT envelope `{ issues: [issue], view_url }` instead of the issue itself. MantisBT answers `PATCH /issues/{id}` with an `issues` array (unlike `POST /issues`, which answers `{ issue }`), but the tool expected `{ issue }`. The response is now the updated issue with `view_url`, the same shape as `get_issue` and `create_issue`. Combined with `remove_monitors`, the monitor list from the field update is reused, which saves one request.
- `add_monitor` always subscribed the owner of the API key instead of the given user. It sent `{ name }`, but MantisBT reads only a `users` array and falls back to the logged-in user when it is missing. The tool now sends `{ users: [{ name }] }` and checks the returned monitor list; the response is now `{ success, monitors }` instead of the full issue object.
- `remove_monitor` always failed with a 404: it called `DELETE /issues/{id}/monitors/{username}`, a route MantisBT (up to 2.28) does not have. The tool now reads the issue's monitors and sends `PATCH /issues/{id}` with the list minus the user — MantisBT treats `monitors` as the complete list. If the user is not a monitor, the call succeeds without changes (`removed: false`). Because MantisBT silently skips monitors the caller may not remove, the tool checks the result and returns an error if the user is still listed (removing other users requires `monitor_delete_others_bug_threshold`). The response now also lists the remaining monitors.

---

## [1.14.1] – 2026-10-24

### Fixed

- Semantic search: the background sync on server start re-fetched and re-embedded **every** issue instead of only the changed ones. The MantisBT REST API ignores the `updated_after` filter the sync relied on, so each start of each client session caused minutes of full CPU load and rewrote the whole index file. The sync now filters by `updated_at` itself and stops paging at the first unchanged issue; issues whose indexed version is already current are not re-embedded. With an up-to-date index a start now fetches a single page.
- Semantic search: only one server process syncs the shared index at a time (lock file `sync.lock` in the search directory, stale locks from crashed processes are taken over). Other processes skip the startup sync; `rebuild_search_index` returns an error while another sync is running. Previously concurrent syncs overwrote each other's `index.json`.
- Semantic search: a server process now reloads the index when another process has rewritten it, instead of writing its outdated copy back on the next flush.
- Semantic search: the embedding model is unloaded after 10 minutes without embedding and reloaded on the next use (a few seconds). Previously each server process kept it loaded until exit — about 0.9 GB RAM per client session once it had searched or indexed anything. An idle process now drops back to roughly the size of the loaded index.
- Semantic search: `last_synced_at` is now taken from the newest `updated_at` reported by the server instead of the local clock, so a client clock running ahead of the server can no longer skip changes. A sync limited to `project_id` no longer advances it, so changes in other projects are not lost.

---

## [1.14.0] – 2026-09-27

### Fixed

- `create_issue` / `update_issue`: a `custom_fields` entry without `value` is now rejected with a validation error. Previously it was accepted and the literal string `"undefined"` was written to the custom field.

### Changed

- **Minimum Node.js version is now 22** (`engines: >=22`). Node.js 18 and 20 are end-of-life and no longer receive security updates; the test toolchain (vitest 5) no longer runs on them, so they could not be tested anymore. CI now runs on Node.js 22. Users on Node.js 20 or older should upgrade — npm only warns about the `engines` mismatch, but these versions are no longer tested.
- Dependencies: `zod` 4 (the MCP SDK supports `^3.25 || ^4`). Tool parameters, types and defaults are unchanged. The published JSON schemas differ slightly: nested `$ref`s are inlined, integer IDs carry an explicit `maximum`, and objects no longer declare `additionalProperties: false` (unknown keys were and still are ignored).
- Dependencies: `@huggingface/transformers` 4 for the optional semantic search. Embeddings are numerically identical to version 3 (verified with the default model), so existing search indexes stay valid — no rebuild needed. This also resolves the `sharp` security advisories reported by `npm audit`.
- Dependencies: `@modelcontextprotocol/sdk` minimum raised to ^1.30.1; transitive dependencies updated to resolve all `npm audit` advisories (including a critical one in `tar`).
- Dev dependencies: vitest and `@vitest/coverage-v8` 5, `@types/node` 22 (matching the minimum Node.js version).
- CI: the publish job now checks `NPM_TOKEN` and `GH_RELEASE_TOKEN` before `npm publish`, so an empty or invalid token stops the release before anything is published. Each publish step (npm, Codeberg release, GitHub release) is skipped when its target already exists, so re-running a failed job only catches up on what is missing.

---

## [1.13.0] – 2026-09-27

### Added

- `create_version` — create a new version in a MantisBT project; returns the created version object (id, name, description, released, obsolete, timestamp)
- `update_version` — update an existing version; only passed fields change (at least one required); renaming rewrites version/target_version/fixed_in_version on all referencing issues; requires `manage_project_threshold` (default: manager)
- `release_version` — mark a version as released (sets its date, default now) and optionally create a follow-up version in the same step via `next_version`; requires `manage_project_threshold` (default: manager)
- `delete_version` — permanently delete a version; irreversible — MantisBT clears version/target_version/fixed_in_version on all referencing issues; requires `manage_project_threshold` (default: manager)
- Version writes are mirrored into the local metadata cache without resetting its timestamp, so `get_metadata` and the project resources stay current without extending the cache TTL.
- New cookbook recipes (EN/DE) for creating, updating, releasing and deleting versions, plus matching prompt examples in `docs/examples.md` and `docs/examples.de.md`.

### Changed

- `get_project_versions` description now documents the `timestamp` field returned per version and cross-references the new version write tools (`create_version`, `update_version`, `release_version`, `delete_version`)
- German documentation (`README.de.md`, `docs/cookbook.de.md`, `docs/examples.de.md`) now uses the en dash (–) as Gedankenstrich instead of the em dash.
- CI: the release job checks the npm token before publishing, and failing Codeberg/GitHub release API calls now fail the job instead of passing silently.

---

## [1.12.0] – 2026-08-28

### Added

- Added `MANTIS_USE_INDEX_PHP=true` for MantisBT installations without URL rewriting. REST requests use `/api/rest/index.php/` instead of `/api/rest/` when enabled. Thanks to [@iantrudell](https://github.com/iantrudell) for the contribution.
- `MANTIS_USE_INDEX_PHP` is detected automatically when `MANTIS_BASE_URL` ends with `/api/rest/index.php`, so pasting the full REST URL of an installation without URL rewriting is enough. An explicitly set value always wins; a base URL contradicting an explicit `false` is reported on stderr instead of failing silently.
- New cookbook section "Connect to an installation without URL rewriting" in `docs/cookbook.md` and `docs/cookbook.de.md`.

### Changed

- `MANTIS_BASE_URL` suffix normalization is now case-insensitive, so `/API/REST` is stripped like `/api/rest`.
- `.env.local` is now read once per process instead of once per config path, removing a duplicate file read on every startup.
- `README.md` and `README.de.md` now link to each other, making the German translation discoverable.

---

## [1.11.0] – 2026-07-03

### Added

- `create_issue` and `update_issue` now accept `custom_fields` (`[{field: {id|name}, value}]`) to write custom field values — reading was already supported via `select`.
- `update_issue` gained an optional `note` parameter (plus `note_view_state`) that appends a note after a successful update — e.g. the reason for a status change in a single call. If the note fails after a successful PATCH, the response contains `note_error` instead of failing the whole call. `dry_run` previews the note as `would_add_note`.
- `get_issue` now supports the `select` parameter for server-side field projection (same as `list_issues`), significantly reducing response size for large issues.

Feature ideas inspired by [kfnzero/mantis-mcp-server#8](https://github.com/kfnzero/mantis-mcp-server/pull/8).

### Security

- **HTTP transport now requires `MCP_HTTP_TOKEN`.** Starting with `TRANSPORT=http` and no token set previously exposed all tools (including writes like `create_issue`, `delete_issue`, `upload_file`) unauthenticated to any process that could reach the port. The server now refuses to start in HTTP mode without a token. **Behaviour change for HTTP users:** set `MCP_HTTP_TOKEN` to a secret value. The stdio transport (the default) is unaffected.
- **`upload_file`'s `file_path` is now disabled over the HTTP transport** unless `MANTIS_UPLOAD_DIR` is configured. Over HTTP, `file_path` reads from the *server's* filesystem — a remote client could otherwise exfiltrate arbitrary server-readable files (e.g. SSH keys) as issue attachments. HTTP clients should upload via the `content` (Base64) parameter. The stdio transport keeps unrestricted `file_path` access (the caller is the trusted local agent); set `MANTIS_UPLOAD_DIR` there too if you want to sandbox it.

---

## [1.10.6] – 2026-06-29

### Changed

- Restored automatic npm publishing via Gitea CI pipeline (triggered on version tags). The manual `--provenance` approach was reverted as Sigstore local signing is not supported outside CI environments with OIDC providers.

---

## [1.10.5] – 2026-06-29

### Security

- Fixed `.npmignore` to explicitly exclude sensitive files (`.env*`, `.mcpregistry_*`) and dev artifacts (`src/`, `tests/`, `scripts/`, `.claude/`, `.gitea/`, `.github/`, `.idea/`). Previously, when `.npmignore` exists, npm ignores `.gitignore` entirely — requiring all exclusions to be duplicated. v1.10.4 was unpublished due to accidental inclusion of local credential files; this patch corrects the root cause.

---

## [1.10.4] – 2026-06-29

### Changed

- npm releases are now published with `--provenance`, creating a Sigstore attestation that cryptographically links each package to its source commit. Verifiable with `npm audit signatures @dpesch/mantisbt-mcp-server`.

---

## [1.10.3] – 2026-05-15

### Fixed
- `upload_file`: file uploads previously used `multipart/form-data` via a now-removed `postFormData` helper. The MantisBT REST API does not accept `multipart/form-data` for file uploads — it expects a JSON body with Base64-encoded content. The tool now sends `POST issues/{id}/files` with a JSON body containing `{ files: [{ name, type, content }] }`. The caller-facing API is unchanged: `file_path` and `content` continue to work as before; the server handles Base64 encoding internally when `file_path` is used.

### Changed
- `upload_file` tool and parameter descriptions updated: `file_path` is now explicitly marked as the preferred input mode (use whenever the file exists on disk — the server reads and encodes it automatically); `content` is marked as a fallback to be used only when `file_path` is not available (e.g. in-memory data or files not accessible via the server filesystem).

---

## [1.10.2] – 2026-05-03

### Changed
- Improved descriptions for `create_issue`, `add_monitor`, `add_note`, `delete_note`, `get_project_users`, and `get_project_versions`: response shapes, prerequisites, and cross-references to related tools (e.g. `find_project_member`, `get_issue_enums`) are now spelled out in each tool description — no behavioural change.

### Fixed
- HTTP transport (`TRANSPORT=http`): concurrent requests (e.g. MCP Inspector sending `resources/list`, `resources/read`, and `tools/list` in parallel) caused `server.close()` to kill the transport of a still-running request, resulting in `ECONNRESET` on the client side. Fixed by serialising requests through a Promise-based queue — each request waits for the previous transport to be fully closed before connecting its own.

---

## [1.10.1] – 2026-05-02

### Added
- GitHub Actions CI workflow (`.github/workflows/ci.yml`): runs on push and pull requests to `main`; steps are typecheck, build, and test on Node.js 20.

### Changed
- Improved descriptions for `upload_file` and `list_issue_files`: both now include return shape, usage guidelines, and cross-references to related tools.

### Fixed
- `upload_file`: removed Zod `.refine()` calls from `inputSchema`. MCP SDK 1.27.x serialized `ZodEffects` (the type produced by `.refine()`) to an empty `properties: {}` object, making all parameters invisible to clients. Imperative validation in the handler is unchanged — the same constraints are still enforced at runtime.

---

## [1.10.0] – 2026-04-11

### Added
- All issue and note responses now include a `view_url` field with the absolute MantisBT web URL for the respective item. The URL is built by the MCP server from `MANTIS_BASE_URL` — it is not provided by the MantisBT REST API. Pattern: `{baseUrl}/view.php?id={issueId}` for issues; `{baseUrl}/view.php?id={issueId}#bugnoteN` for notes. The field is present in all tools that return issues or notes: `get_issue`, `get_issues`, `list_issues`, `create_issue`, `update_issue`, `list_notes`, `add_note`, and `search_issues`. It is always included regardless of the `select` parameter.
- `MantisClient` gains a new public `getBaseUrl()` method (returns the resolved, normalised base URL).

---

## [1.9.1] – 2026-03-30

### Fixed
- Boolean parameters (`dry_run`, `highlight`, `check_latest`, `obsolete`, `inherit`) now accept the strings `"true"` and `"false"` in addition to native booleans. MCP clients that serialize all parameters as JSON strings no longer receive error -32602. Note: `z.coerce.boolean()` was intentionally not used — it would silently convert the string `"false"` to `true` via JavaScript's `Boolean()`.
- `update_issue`: the `fields` parameter now accepts a JSON-encoded string in addition to a plain object. Invalid JSON is caught and surfaced as a Zod validation error instead of an uncaught `SyntaxError`.

---

## [1.9.0] – 2026-03-28

### Added
- New tool `get_issues`: fetch multiple MantisBT issues by ID in a single MCP call. Requests run in parallel (max 5 concurrent). Missing or inaccessible IDs return `null` at their array position instead of failing the entire call. Response includes `requested`, `found`, and `failed` counters. Accepts 1–50 IDs per call.
- `update_issue` now accepts an optional `dry_run` parameter. When `dry_run: true`, the tool returns the patch payload that would be sent without actually updating the issue — useful for previewing changes before committing them.
- `list_issues` now accepts four date filter parameters: `updated_after`, `updated_before`, `created_after`, `created_before` (ISO-8601, exclusive). Filters are applied client-side with an early-exit optimisation: once a batch of results is fully older than `updated_after`, further pages are not fetched.
- `search_issues` now accepts the same four date filter parameters. Without `select`, filtering uses VectraStore metadata (no extra API calls). With `select`, filtering uses the already-fetched issue object.
- `search_issues` now accepts an optional `highlight` parameter (default: `false`). When `true`, each result gains a `highlights` field containing the issue summary with matching query terms wrapped in `**bold**` markdown, and a short description snippet (~300 chars) centered around the first match. Highlights are keyword-based (lexical), not semantic — results without a lexical overlap will not have a `highlights` field. Without `select`, highlights are built from the VectraStore metadata (no extra API calls); with `select`, from the fetched issue fields.
- `VectorStore` interface extended with `getItem(id)` to support metadata lookups without re-fetching from the API.
- New internal module `src/date-filter.ts` with shared `matchesDateFilter`, `hasDateFilter`, and `dateFilterSchema` — reused by both tools.
- New internal module `src/search/highlight.ts` with `extractTerms`, `highlightText`, `hasTermMatch`, and `extractSnippet` — used by `search_issues` highlighting.

### Changed
- `get_issue` tool description now explicitly states that notes are always included in the response — no separate `list_notes` call needed.
- `list_notes` tool description now clarifies it is only needed when fetching notes without the full issue object.
- `create_issue` now accepts localized enum names for `severity`, `priority`, and `reproducibility` in addition to canonical English names. The server resolves the value against a static canonical table first; on a miss, it falls back to a live `get_issue_enums` lookup and matches against the `name` and `label` fields (case-insensitive). Only truly unknown values produce an error.
- `update_issue` now resolves enum names for `status`, `priority`, `severity`, `resolution`, and `reproducibility` before sending the PATCH request. Pass a canonical English name, a localized name, or a numeric `id` — all are accepted. Unknown names are passed through unchanged and validated by the MantisBT API.
- `list_issues` status filter now compares by ID when a canonical English status name is recognised (e.g. `"new"` → `id=10`). This makes the filter language-independent: it correctly matches issues on localized installations where the API returns translated status names. Non-canonical values (e.g. passing a localized name directly) fall back to name comparison as before.

---

## [1.8.3] – 2026-03-28

### Added
- New optional env var `MCP_TEST_ENVIRONMENT=true`. When set, `resources/list` skips live API calls and returns only static resources. Intended for automated inspection environments (e.g. Glama Docker builds) that start the server with placeholder credentials and restricted network access.

### Fixed
- All `MantisClient` fetch calls now use a 30-second timeout via `AbortSignal.timeout()`. Previously, a slow or unreachable MantisBT instance would cause fetch calls to hang indefinitely.

---

## [1.8.2] – 2026-03-27

### Fixed
- HTTP transport (`TRANSPORT=http`): race condition when multiple sequential requests arrive quickly (e.g. `initialize` followed immediately by `ping`). The `res.on('close')` handler that calls `transport.close()` fires asynchronously, so the next request could arrive while the previous transport was still registered — causing `connect()` to throw "Already connected". Fixed by calling `await server.close()` before each `server.connect()` call (a no-op when not connected). Also added a `res.headersSent` guard in the error handler to prevent a secondary "Cannot set headers after they are sent" error from closing the socket without a response.

---

## [1.8.1] – 2026-03-27

### Fixed
- `MANTIS_BASE_URL` values ending in `/api/rest` (as shown in README examples) caused a doubled path (`/api/rest/api/rest/...`) and broke all API calls. A new `normalizeBaseUrl()` helper strips the `/api/rest` suffix (and any trailing slash) on startup. Both formats are now accepted: `https://your-mantis.example.com` and `https://your-mantis.example.com/api/rest`.

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
