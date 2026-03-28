@.claude/lessons.md

# CLAUDE.md – mantisbt-mcp-server

## What is this project?

An **MCP server** (Model Context Protocol) integrating the **MantisBT REST API** into Claude Code and other MCP-capable clients. Issues can be read, created, and updated without leaving the editor.

---

## Tech stack

- **TypeScript**, `@modelcontextprotocol/sdk`, ESM module (`"type": "module"`)
- Zod for schema validation
- **stdio** transport by default; **HTTP** (Streamable HTTP) via `TRANSPORT=http`
- Fetch-based API client — no axios, no heavy dependencies
- Tools registered in `src/tools/**/*.ts`; cache in `src/cache.ts`; search module in `src/search/`

---

## Key Commands

```bash
npm install       # Install dependencies
npm run build     # Compile TypeScript → dist/
npm run typecheck # Type check without output (fast)
npm run dev       # Watch mode for development
npm test          # Run tests (vitest)
npm run init      # First-time setup: checks Node ≥18, installs deps + git hooks
```

---

## Versioning & compatibility promise

Follows [Semantic Versioning](https://semver.org/). The **public API** = tool names, parameter names/types/defaults, env vars, and the `~/.claude/mantis.json` config schema.

IMPORTANT: These changes always require a **major** version bump:
- Tool renamed or removed
- Required parameter added to an existing tool
- Parameter default changed
- Env var renamed or removed (`MANTIS_BASE_URL`, `MANTIS_API_KEY`, `MANTIS_CACHE_DIR`, `MANTIS_CACHE_TTL`, `TRANSPORT`, `PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_TOKEN`, `MANTIS_UPLOAD_DIR`, `MANTIS_SEARCH_ENABLED`, `MANTIS_SEARCH_THREADS`, `MANTIS_SEARCH_DIR`, `MANTIS_SEARCH_MODEL`, `MANTIS_SEARCH_BACKEND`)
- Config file key renamed or removed (`base_url`, `api_key`)

Minor = new optional parameter or new tool. Patch = bug fix without behavior change.

**Deprecation:** Mark deprecated in a minor release (README + tool description), remove no earlier than next major.

**Release checklist:**
- [ ] All changes since last tag documented in `CHANGELOG.md`
- [ ] `package.json` version bumped
- [ ] Version type (patch/minor/major) matches the rules above
- [ ] For major: migration notes in CHANGELOG under `### Breaking Changes`

---

## Publishing workflow

IMPORTANT: Three publish channels — always push to all three on release:
- **origin** — internal Gitolite server (always, even for WIP)
- **upstream** — Codeberg (public, filtered without `.claude/`)
- **npm** — `@dpesch/mantisbt-mcp-server` (end users via `npx`)

Use guided workflows:
- `/create-release` — prepare version, CHANGELOG, tag
- `/push` — push to origin and/or upstream
- `/publish` — full release: create, push, npm publish

See `.claude/publishing-guide.md` for quick reference.

---

## SDK documentation via context7

`@modelcontextprotocol/sdk` is actively developed. Always use context7 for up-to-date API docs (tool response format, transport classes, server lifecycle):
- Resolver: `@modelcontextprotocol/sdk`
