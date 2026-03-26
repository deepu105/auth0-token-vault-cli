# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Auth0 Token Vault CLI (`auth0-tv`) — a Node.js CLI that authenticates users via Auth0, connects third-party services (Gmail, Slack, GitHub, etc.) through Auth0 Token Vault, and lets users interact with those services from the terminal. Designed as a dual-mode tool for both humans and AI agents (via `--json` output).

## Commands

```bash
npm run dev -- <args>       # Run CLI in dev mode (tsx)
npm run build               # TypeScript compile (runs format + lint first via prebuild)
npm run test                # Run all tests (vitest)
npm run test -- test/store/credential-store.test.ts  # Run a single test file
npm run test:watch          # Watch mode
npm run lint                # ESLint on src/
npm run typecheck           # tsc --noEmit
```

## Architecture

**CLI framework:** Commander.js. Entry point is `src/index.ts` which registers top-level commands and the `gmail` subcommand group.

**Command pattern:** Each command lives in `src/commands/` and exports a `register*Command(program)` function (or `create*Command()` for subgroups). Commands use `output()` / `outputError()` from `src/utils/output.ts` to support both human-readable and `--json` output modes.

**Auth flow:** Browser-based PKCE login (`src/auth/pkce-flow.ts`) opens a local HTTP server on ports 18484-18489 to receive the OAuth callback. Token exchange for third-party services (`src/auth/token-exchange.ts`) uses Auth0's federated connection access token grant type with the stored refresh token.

**Credential storage:** Two-tier facade pattern:

- `CredentialStore` (facade in `src/store/credential-store.ts`) — handles expiry logic (5-min buffer), caching, and delegates to a backend
- `CredentialBackend` interface (`src/store/backend.ts`) — implemented by `KeyringBackend` (OS keychain via keytar) and `FileBackend` (JSON in `~/.auth0-tv/`)
- Backend selection: `AUTH0_TV_STORAGE` env var, defaults to `keyring`

**Config resolution:** `mergeConfigFromEnvAndStore()` in `src/utils/config.ts` resolves each field individually: env var takes precedence over credential store. Required fields: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`.

**Service layer:** `src/services/gmail/` contains the Gmail API client (`client.ts` using googleapis), formatters, and types. Commands in `src/commands/gmail/` are thin wrappers that parse args, call the service, and format output.

**Exit codes:** Defined in `src/utils/exit-codes.ts` — distinct codes for auth required (3), authorization/connection required (4), service errors (5), and network errors (6).

**Destructive action safety:** Commands like send, delete, archive, forward require `--confirm`/`--yes` in non-interactive (agent) mode.

## Testing

Tests use Vitest with MSW (Mock Service Worker) for HTTP mocking. Test setup (`test/setup.ts`) sets dummy Auth0 env vars to prevent accidental use of real credentials. Mock handlers are in `test/mocks/`. Tests mirror `src/` structure under `test/`.

## Key Conventions

- ESM throughout (`"type": "module"` in package.json) — all local imports use `.js` extensions
- Debug logging via the `debug` package (wrapped in `src/utils/logger.ts`)
- The `output()` helper must be used for all command output to maintain dual-mode (human/JSON) support
- `AUTH0_TV_OUTPUT=json` env var auto-enables JSON mode (alternative to `--json` flag)

## Agent Skill

An [Agent Skills](https://agentskills.io) manifest is at `skills/auth0-token-vault/SKILL.md` (with a symlink at `.claude/skills/` for Claude Code). It defines how agents discover and invoke `auth0-tv`, including exit code recovery, destructive action patterns, and the full command reference in `references/commands.md`.
