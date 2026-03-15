# MantisBT MCP Server

[![npm version](https://img.shields.io/npm/v/@dpesch/mantisbt-mcp-server)](https://www.npmjs.com/package/@dpesch/mantisbt-mcp-server)
[![license](https://img.shields.io/npm/l/@dpesch/mantisbt-mcp-server)](LICENSE)

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
npm install
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
| `MANTIS_BASE_URL` | ✅ | – | Base URL of the MantisBT REST API |
| `MANTIS_API_KEY` | ✅ | – | API token for authentication |
| `MANTIS_CACHE_DIR` | – | `~/.cache/mantisbt-mcp` | Directory for the metadata cache |
| `MANTIS_CACHE_TTL` | – | `3600` | Cache lifetime in seconds |
| `TRANSPORT` | – | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | – | `3000` | Port for HTTP mode |

### Config file (fallback)

If no environment variables are set, `~/.claude/mantis.json` is read:

```json
{
  "base_url": "https://your-mantis.example.com/api/rest",
  "api_key": "your-api-token"
}
```

## Available tools

### Issues

| Tool | Description |
|---|---|
| `get_issue` | Retrieve an issue by its numeric ID |
| `list_issues` | Filter issues by project, status, author, and more |
| `create_issue` | Create a new issue |
| `update_issue` | Update an existing issue |
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

### Relationships

| Tool | Description |
|---|---|
| `add_relationship` | Create a relationship between two issues |

### Monitors

| Tool | Description |
|---|---|
| `add_monitor` | Add yourself as a monitor of an issue |

### Tags

| Tool | Description |
|---|---|
| `list_tags` | List all available tags |
| `attach_tags` | Attach tags to an issue |
| `detach_tag` | Remove a tag from an issue |

### Projects

| Tool | Description |
|---|---|
| `list_projects` | List all accessible projects |
| `get_project_versions` | Get versions of a project |
| `get_project_categories` | Get categories of a project |
| `get_project_users` | Get users of a project |

### Metadata & system

| Tool | Description |
|---|---|
| `get_metadata` | Retrieve cached metadata (projects, users, versions, categories) |
| `sync_metadata` | Refresh the metadata cache |
| `list_filters` | List saved filters |
| `get_current_user` | Retrieve your own user profile |
| `list_languages` | List available languages |
| `get_config` | Show server configuration (base URL, cache TTL) |
| `get_mantis_version` | Get MantisBT version and check for updates |

## HTTP mode

For use as a standalone server (e.g. in remote setups):

```bash
MANTIS_BASE_URL=... MANTIS_API_KEY=... TRANSPORT=http PORT=3456 node dist/index.js
```

Health check: `GET http://localhost:3456/health`

## Development

```bash
npm install          # Install dependencies
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
