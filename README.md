# MantisBT MCP Server

[![npm version](https://img.shields.io/npm/v/@dpesch/mantisbt-mcp-server)](https://www.npmjs.com/package/@dpesch/mantisbt-mcp-server)
[![license](https://img.shields.io/npm/l/@dpesch/mantisbt-mcp-server)](LICENSE)
[![MCP Badge](https://lobehub.com/badge/mcp/dpesch-mantisbt-mcp-server)](https://lobehub.com/mcp/dpesch-mantisbt-mcp-server)
[![MantisBT MCP Server](https://glama.ai/mcp/servers/dpesch/mantisbt-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/dpesch/mantisbt-mcp-server)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that integrates the [MantisBT REST API](https://documenter.getpostman.com/view/29959/mantis-bug-tracker-rest-api) into Claude Code and other MCP-capable clients. Read, create, and update issues directly from your editor.

## Requirements

- Node.js ≥ 18
- MantisBT installation with REST API enabled (version 2.23+)
- MantisBT API token (create under *My Account → API Tokens*)

## Installation

**Via npx (recommended):**

Add to `~/.claude/claude_desktop_config.json` (Claude Desktop) or your local
`claude_desktop_config.json` (Claude Code):

```json
{
  "mcpServers": {
    "mantisbt": {
      "command": "npx",
      "args": ["-y", "@dpesch/mantisbt-mcp-server"],
      "env": {
        "MANTIS_BASE_URL": "https://your-mantis.example.com/api/rest",
        "MANTIS_API_KEY": "your-api-token"
      }
    }
  }
}
```

**Local build:**

```bash
git clone https://codeberg.org/dpesch/mantisbt-mcp-server
cd mantisbt-mcp-server
npm run init
npm run build
```

```json
{
  "mcpServers": {
    "mantisbt": {
      "command": "node",
      "args": ["/path/to/mantisbt-mcp-server/dist/index.js"],
      "env": {
        "MANTIS_BASE_URL": "https://your-mantis.example.com/api/rest",
        "MANTIS_API_KEY": "your-api-token"
      }
    }
  }
}
```

## Configuration

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MANTIS_BASE_URL` | ✅ | – | Base URL of your MantisBT installation. Both `https://your-mantis.example.com` and `https://your-mantis.example.com/api/rest` are accepted — the `/api/rest` suffix is normalized automatically. |
| `MANTIS_API_KEY` | ✅ | – | API token for authentication |
| `MANTIS_CACHE_DIR` | – | `~/.cache/mantisbt-mcp` | Directory for the metadata cache |
| `MANTIS_CACHE_TTL` | – | `3600` | Cache lifetime in seconds |
| `TRANSPORT` | – | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | – | `3000` | Port for HTTP mode |
| `MCP_HTTP_HOST` | – | `127.0.0.1` | Bind address for HTTP mode. **Changed from `0.0.0.0` to `127.0.0.1`** — the server now listens on localhost only by default. Set to `0.0.0.0` for Docker or remote access. |
| `MCP_HTTP_TOKEN` | – | – | When set, the `/mcp` endpoint requires `Authorization: Bearer <token>`. The `/health` endpoint is always public. |
| `MANTIS_SEARCH_ENABLED` | – | `false` | Set to `true` to enable semantic search |
| `MANTIS_SEARCH_BACKEND` | – | `vectra` | Vector store backend: `vectra` (pure JS) or `sqlite-vec` (requires manual install) |
| `MANTIS_SEARCH_DIR` | – | `{MANTIS_CACHE_DIR}/search` | Directory for the search index |
| `MANTIS_SEARCH_MODEL` | – | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | Embedding model name (downloaded once on first use, ~80 MB) |
| `MANTIS_SEARCH_THREADS` | – | `1` | Number of ONNX intra-op threads for the embedding model. Default is 1 to prevent CPU saturation on multi-core machines and WSL. Increase only if index rebuild speed matters and the host is dedicated to this workload. |
| `MANTIS_UPLOAD_DIR` | – | – | Restrict `upload_file` to files within this directory. When set, any `file_path` outside the directory is rejected (path traversal attempts via `../` are blocked). Without this variable there is no restriction. |

## Available tools

### Issues

| Tool | Description |
|---|---|
| `get_issue` | Retrieve an issue by its numeric ID |
| `get_issues` | Retrieve multiple issues by ID in one call (1–50 IDs); missing or inaccessible IDs return `null` at their position instead of failing the call |
| `list_issues` | Filter issues by project, status, author, and more; optional `select` for field projection and `status` for client-side status filtering — canonical English status names (e.g. `"new"`, `"resolved"`) are matched by ID, making the filter language-independent on localized installations |
| `create_issue` | Create a new issue; `severity` and `priority` must be canonical English names (e.g. `minor`, `major`, `normal`, `high`) — call `get_issue_enums` to see all valid values and their localized labels; optional `handler` parameter accepts a username as alternative to `handler_id` (resolved against project members) |
| `update_issue` | Update an existing issue; enum fields (`status`, `priority`, `severity`, `resolution`, `reproducibility`) accept canonical English names, localized names, or numeric IDs — the server resolves names to IDs automatically |
| `delete_issue` | Delete an issue |

### Notes

| Tool | Description |
|---|---|
| `list_notes` | List all notes of an issue |
| `add_note` | Add a note to an issue |
| `delete_note` | Delete a note |

### Attachments

| Tool | Description |
|---|---|
| `list_issue_files` | List attachments of an issue |
| `upload_file` | Upload a file to an issue — either by local `file_path` or Base64-encoded `content` + `filename` |

### Relationships

| Tool | Description |
|---|---|
| `add_relationship` | Create a relationship between two issues; optional `type_name` parameter accepts a string name (e.g. `"related_to"`, `"duplicate_of"`) as alternative to numeric `type_id` |
| `remove_relationship` | Remove a relationship from an issue (use the `id` from the relationship object, not the type) |

### Monitors

| Tool | Description |
|---|---|
| `add_monitor` | Add yourself as a monitor of an issue |
| `remove_monitor` | Remove a user as a monitor of an issue |

### Tags

| Tool | Description |
|---|---|
| `list_tags` | List all available tags; falls back to the metadata cache when `GET /tags` returns 404 (run `sync_metadata` first to populate) |
| `attach_tags` | Attach tags to an issue |
| `detach_tag` | Remove a tag from an issue |

### Projects

| Tool | Description |
|---|---|
| `list_projects` | List all accessible projects; returns normalized project data (consistent with `sync_metadata` cache) |
| `get_project_versions` | Get versions of a project; optional `obsolete` and `inherit` booleans to include obsolete or parent-inherited versions |
| `get_project_categories` | Get categories of a project |
| `get_project_users` | Get users of a project |
| `find_project_member` | Search project members by name, real name, or email (case-insensitive substring match); optional `query` and `limit` (default 10, max 100); cache-first |

### Semantic search *(optional)*

Instead of exact keyword matching, semantic search understands the *meaning* behind a query. Ask in plain language — the search engine finds conceptually related issues even when the wording doesn't match:

- *"login fails after password reset"* — finds issues about authentication edge cases
- *"performance problems on the checkout page"* — surfaces related reports regardless of the exact terminology used
- *"duplicate entries in the invoice list"* — catches issues described as "shown twice", "double records", etc.

The embedding model (~80 MB) runs entirely **offline** — no OpenAI key, no external API. It is downloaded once on first start and cached locally. Issues are indexed incrementally on every server start (only new and updated issues are re-indexed).

Activate with `MANTIS_SEARCH_ENABLED=true`.

| Tool | Description |
|---|---|
| `search_issues` | Natural language search over all indexed issues — returns top-N results with cosine similarity score; optional `select` (comma-separated field names) enriches each result with the requested issue fields; optional `highlight` (boolean, default `false`) adds a `highlights` field per result with keyword-matched excerpts from `summary` and `description` (matched terms shown in `**bold**`) |
| `rebuild_search_index` | Build or update the search index; `full: true` clears and rebuilds from scratch |
| `get_search_index_status` | Return the current fill level of the search index: how many issues are indexed vs. total, and the timestamp of the last sync |

#### Which backend to choose?

| | `vectra` *(default)* | `sqlite-vec` |
|---|---|---|
| Dependencies | None (pure JS) | Requires native build tools |
| Install | Included | `npm install sqlite-vec better-sqlite3` |
| Best for | Up to ~10,000 issues | 10,000+ issues |
| Performance | Fast enough for most setups | Faster for large corpora |

Start with `vectra`. Switch to `sqlite-vec` if indexing or query times become noticeably slow.

```bash
npm install sqlite-vec better-sqlite3
# then set MANTIS_SEARCH_BACKEND=sqlite-vec
```

### Metadata & system

| Tool | Description |
|---|---|
| `get_issue_fields` | Return all field names valid for the `select` parameter of `list_issues` |
| `get_metadata` | Retrieve a compact metadata summary: project/tag counts and per-project user/version/category counts; use `get_metadata_full` for complete arrays |
| `get_metadata_full` | Return the full raw metadata cache as minified JSON (all projects with complete fields, users/versions/categories per project, all tags) |
| `sync_metadata` | Refresh the metadata cache |
| `list_filters` | List saved filters |
| `get_current_user` | Retrieve your own user profile |
| `list_languages` | List available languages |
| `get_config` | Show server configuration (base URL, cache TTL) |
| `get_issue_enums` | Return valid ID/name pairs for all issue enum fields (severity, status, priority, resolution, reproducibility) — use before `create_issue` / `update_issue` to look up correct values; on localized installations each entry may include a `canonical_name` with the standard English API name |
| `get_mantis_version` | Get MantisBT version and check for updates |
| `get_mcp_version` | Return the version of this mantisbt-mcp-server instance |

## Available resources

MCP Resources are URI-addressable, read-only data that clients can fetch directly without calling a tool. They are the third MCP primitive alongside Tools and Prompts. Note that Resource support is less widely implemented in MCP clients than Tools — check your client's documentation.

| Resource URI | Description |
|---|---|
| `mantis://me` | Profile of the authenticated API user (live fetch) |
| `mantis://projects` | All accessible MantisBT projects as a compact list (cache-backed, refreshed via `sync_metadata`) |
| `mantis://projects/{id}` | Combined project view: project fields + users + versions + categories in one call; cache-first, list-support for enumerating all available project URIs |
| `mantis://enums` | Valid values for all issue enum fields: severity, priority, status, resolution, reproducibility (live fetch) |

## Available prompts

MCP prompt templates are conversation starters that instruct the LLM to collect structured input and then call the appropriate tool. They are not tools themselves — they initiate a guided workflow.

| Prompt | Required args | Optional args | Description |
|---|---|---|---|
| `create-bug-report` | `project_id`, `category`, `summary`, `description` | `steps_to_reproduce`, `expected`, `actual`, `environment` | Guides through a structured bug report and calls `create_issue` |
| `create-feature-request` | `project_id`, `category`, `summary`, `description` | `use_case` | Guides through a feature request and calls `create_issue` |
| `summarize-issue` | `issue_id` | – | Fetches an issue via `get_issue` and returns a concise summary |
| `project-status` | `project_id` | – | Lists issues via `list_issues` and generates a status report grouped by severity |

## HTTP mode

For use as a standalone server (e.g. in remote setups):

```bash
MANTIS_BASE_URL=... MANTIS_API_KEY=... TRANSPORT=http PORT=3456 node dist/index.js

# With token authentication and explicit bind address (required for Docker/remote):
# MCP_HTTP_TOKEN=secret MANTIS_BASE_URL=... MANTIS_API_KEY=... \
#   TRANSPORT=http PORT=3456 MCP_HTTP_HOST=0.0.0.0 node dist/index.js
```

Health check: `GET http://localhost:3456/health` (always public, no token required)

## Documentation

- [**Cookbook**](docs/cookbook.md) — tool-oriented recipes with copy-paste-ready parameter examples for all registered tools
- [**Usage Examples**](docs/examples.md) — natural language prompt examples for everyday use cases (no tool names required)

## Development

```bash
npm run init         # First-time setup: install deps, git hooks, typecheck
npm run build        # Compile TypeScript → dist/
npm run typecheck    # Type check without output
npm run dev          # Watch mode for development
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Coverage report
```

## License

MIT – see [LICENSE](LICENSE)

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md).
Repository: [codeberg.org/dpesch/mantisbt-mcp-server](https://codeberg.org/dpesch/mantisbt-mcp-server)
