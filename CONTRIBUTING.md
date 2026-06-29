# Contributing

Thank you for your interest in contributing to `mantisbt-mcp-server`!

## Prerequisites

- Node.js ≥ 18
- A MantisBT instance with a valid API token for integration testing

## Setup

```bash
git clone https://codeberg.org/dpesch/mantisbt-mcp-server
cd mantisbt-mcp-server
npm install
npm run build
```

## Development

```bash
npm run dev       # TypeScript watch mode
npm run typecheck # Type check without emitting files
npm run build     # Single build
```

Set the required environment variables:

```bash
export MANTIS_BASE_URL="https://your-mantis-instance.example.com/api/rest"
export MANTIS_API_KEY="your-api-token"
node dist/index.js
```

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Push and open a pull request against `main`

Please describe **why** you made the change, not just what you changed.

> **Note:** This repository on Codeberg is a public mirror. Pull requests are
> reviewed and integrated via cherry-pick into the authoritative upstream — they
> are not merged directly through Codeberg. Your contribution will be credited
> in the commit message and CHANGELOG.

## Release process

Every release is published with **npm provenance** — a cryptographic attestation that links the package on npm to the exact source commit it was built from.

### Publishing with provenance

Run in a separate terminal (not inside Claude's Bash tool — the interactive prompts don't work there):

```bash
npm publish --access public --provenance
```

Two browser interactions are expected:

1. **npm 2FA** — npm opens a URL for one-time password authentication
2. **Sigstore signing** — Sigstore opens a second URL for identity confirmation (sign in with GitHub, Google, or Microsoft)

Both steps are required. After confirming both, the package is published with an attached provenance attestation.

### Verifying provenance

Anyone can verify the published package:

```bash
npm audit signatures @dpesch/mantisbt-mcp-server
```

The **Provenance** tab on the [npm package page](https://www.npmjs.com/package/@dpesch/mantisbt-mcp-server) shows the attested commit and signing identity.

---

## Reporting Issues

Open an issue on [Codeberg](https://codeberg.org/dpesch/mantisbt-mcp-server/issues) with:
- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Node.js version, OS, and MantisBT version

## Code Style

- TypeScript strict mode
- No external HTTP libraries (use `fetch`)
- Keep the module structure: `src/tools/` for MCP tool registrations
- English for code and comments; German is welcome in issues and PRs

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).