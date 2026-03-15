@.claude/lessons.md

# CLAUDE.md – Project context for Claude Code

This file gives Claude Code full context about the origin, design decisions, and open tasks of the `mantisbt-mcp-server` project.

---

## What is this project?

An **MCP server** (Model Context Protocol) that integrates the **MantisBT REST API**, bringing issue tracking directly into Claude Code and other MCP-capable clients.

**Why was it built?** The project uses MantisBT as its bug tracker and wanted to make the API available to Claude via MCP — so that issues can be read, created, and updated without leaving the editor.

---

## Tech stack and design decisions

### Language & framework
- **TypeScript** with the official `@modelcontextprotocol/sdk`
- ESM module (`"type": "module"`)
- Zod for schema validation

### Transport
- **stdio** as default (for local Claude Code / Claude Desktop use)
- **HTTP** (Streamable HTTP) as alternative via `TRANSPORT=http` environment variable
- Health endpoint available at `GET /health` in HTTP mode

### Project structure
```
src/
├── index.ts          ← Entry point, transport selection
├── types.ts          ← All TypeScript interfaces (MantisIssue, etc.)
├── constants.ts      ← Shared constants
├── config.ts         ← Configuration loader (env vars + ~/.claude/mantis.json fallback)
├── client.ts         ← MantisBT REST API client (fetch-based)
├── cache.ts          ← Metadata cache (projects, users, versions, categories)
└── tools/
    ├── issues.ts     ← Issue CRUD tools
    ├── notes.ts      ← Issue note tools
    ├── files.ts      ← Attachment tools
    ├── relationships.ts ← Issue relationship tools
    ├── monitors.ts   ← Issue monitor tools
    ├── projects.ts   ← Project tools
    ├── users.ts      ← User tools
    ├── filters.ts    ← Filter tools
    ├── config.ts     ← Configuration tools
    └── metadata.ts   ← Metadata tools (cached)
```

### Authentication & configuration

**Environment variables (preferred):**
```bash
MANTIS_BASE_URL="https://your-mantis.example.com/api/rest"
MANTIS_API_KEY="your-api-token"
MANTIS_CACHE_DIR="/path/to/cache"   # optional, default: ~/.cache/mantisbt-mcp
MANTIS_CACHE_TTL="86400"            # optional, default: 86400 seconds
TRANSPORT="http"                     # optional, default: stdio
PORT="3000"                          # optional, default: 3000 (HTTP mode only)
```

**Config file fallback** (`~/.claude/mantis.json`):
```json
{
  "base_url": "https://your-mantis.example.com/api/rest",
  "api_key": "your-api-token"
}
```

---

## Key Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/
npm run typecheck    # Type check without output (fast)
npm run dev          # Watch mode for development
npm start            # Start server (stdio)
```

HTTP mode:
```bash
MANTIS_BASE_URL=... MANTIS_API_KEY=... TRANSPORT=http PORT=3456 node dist/index.js
```

---

## Versioning and compatibility promise

This project follows [Semantic Versioning 2.0.0](https://semver.org/) and is guided by the Symfony Backward Compatibility Promise: minor and patch releases must not cause unexpected side effects for existing integrations.

---

### What is the public API of this project?

The public API encompasses everything that MCP clients and external users rely on:

#### Tool interfaces (strictly stable)
- **Tool names** registered in `src/tools/**/*.ts`
  — Renaming or removing is always a breaking change (→ major).
- **Parameter names and types:** Existing parameters must not be renamed,
  removed, or changed in semantics (→ major).
- **Required/optional status:** An optional parameter must not become
  required (→ major). The reverse is allowed (→ minor).
- **Parameter defaults:** Changes to default values count as a breaking change (→ major).

#### Environment variables (strictly stable)
Existing variables (`MANTIS_BASE_URL`, `MANTIS_API_KEY`, `MANTIS_CACHE_DIR`,
`MANTIS_CACHE_TTL`, `TRANSPORT`, `PORT`) must not be renamed or removed in
minor/patch releases (→ major).
Introducing new optional variables is allowed (→ minor).

#### Config file schema (strictly stable)
The `~/.claude/mantis.json` fallback format (`base_url`, `api_key`) must not
change keys or types (→ major). New optional keys are allowed (→ minor).

---

### What is internal and may change at any time?

- File structure under `src/` (module names, classes, internal functions)
- Internal TypeScript types not exposed via tool interfaces
- Build configuration (`tsconfig.json`, `package.json` scripts)
- Developer tooling (lint, format, CI configuration)
- Cache format and location (not part of the public API)

---

### Versioning rules at a glance

| Change type                                          | Version   |
|------------------------------------------------------|-----------|
| Bug fix without behavior change                      | patch     |
| New optional tool parameter                          | minor     |
| New tool                                             | minor     |
| New optional environment variable                    | minor     |
| Tool name changed or removed                         | **major** |
| Required parameter added                             | **major** |
| Parameter default changed                            | **major** |
| Existing environment variable renamed/removed        | **major** |
| Config file key renamed/removed                      | **major** |

---

### Deprecation process

To remove something from the public API:

1. Mark as deprecated in a **minor** release (note in README and
   in the tool description in the MCP response).
2. Remove no earlier than the **next major** release.
3. Document in `CHANGELOG.md` under `### Deprecated`.

---

### Release checklist

Before every release:

- [ ] All changes since the last tag documented in `CHANGELOG.md`
- [ ] Version number set in `package.json`
- [ ] Git tag set (`git tag v1.2.3`)
- [ ] Verified: does the version type (patch/minor/major) match the rules above?
- [ ] For major: migration notes in CHANGELOG under `### Breaking Changes`

---

## Configuration (Claude Desktop / Claude Code)

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

Local build (replace path accordingly):
```json
{
  "mcpServers": {
    "mantisbt": {
      "command": "node",
      "args": ["C:/dev.local/mcp-servers/mantisbt-mcp-server/dist/index.js"],
      "env": {
        "MANTIS_BASE_URL": "https://your-mantis.example.com/api/rest",
        "MANTIS_API_KEY": "your-api-token"
      }
    }
  }
}
```

---

## Open-source setup: status

### Repository setup
- [x] Choose a license — **MIT** (LICENSE file present, package.json updated)
- [x] Create `.gitignore` for Node.js (`node_modules/`, `dist/`)
- [x] Create `CHANGELOG.md`
- [x] Create `CONTRIBUTING.md`
- [ ] Repository published on Codeberg: `codeberg.org/dpesch/mantisbt-mcp-server`

### package.json
- [x] `repository` field set (Codeberg URL)
- [x] `license` field set (`MIT`)
- [x] `keywords` set
- [x] `author` field set
- [x] `engines` field set: `{ "node": ">=18" }`

### CI/CD
- [ ] CI workflow for automatic build & test on push
- [ ] Published on npm as `@dpesch/mantisbt-mcp-server`

### Documentation
- [ ] README.md with badges (npm version, license)
- [ ] Apply for inclusion in the official MCP server index

### Tests
- [ ] No tests yet — set up basic unit test structure with `vitest` or `jest`

---

## Publishing workflow

Three publish channels:
- **origin** – internal Gitolite server (always, even for WIP)
- **upstream** – Codeberg (public, filtered without `.claude/`)
- **npm** – `@dpesch/mantisbt-mcp-server` (end users via `npx`)

Guided workflows:
- `/create-release` – prepare version, CHANGELOG, tag
- `/push` – push to origin and/or upstream
- `/publish` – full release: create, push, npm publish

See `.claude/publishing-guide.md` for quick reference.

---

## SDK documentation via context7

The `@modelcontextprotocol/sdk` is actively developed. Always use context7 for up-to-date API documentation:
- Tool response format, transport classes, server lifecycle
- Resolver: `@modelcontextprotocol/sdk`