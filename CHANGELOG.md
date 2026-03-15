# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

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
