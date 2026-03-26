---
title: 'Move Auth0 config into credential store with login prompts'
type: feat
status: completed
date: 2026-03-25
---

# Move Auth0 config into credential store with login prompts

## Overview

Move Auth0 configuration (domain, clientId, clientSecret, audience) out of `~/.auth0-tv/config.json` and environment-variable-only resolution into the credential store (keyring or file backend). During `auth0-tv login`, prompt the user for these values interactively if they aren't set as environment variables and aren't already stored. Add a `--reconfigure` flag to force re-prompting. Non-login commands read config from env vars first, then the store, and error if neither is available.

## Problem Frame

Today, users must either set environment variables or manually create `~/.auth0-tv/config.json` before they can use the CLI. This is friction-heavy for first-time setup and stores `clientSecret` in a plaintext file. Moving config into the credential store means: (1) first-run experience is guided by interactive prompts, (2) secrets are protected by the OS keyring by default, and (3) the separate config file is no longer needed for Auth0 credentials.

## Requirements Trace

- R1. `auth0-tv login` prompts for domain, clientId, clientSecret, and audience when not set via env vars and not already in the store
- R2. If env vars (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`) are set, skip prompts and use env vars directly — do not persist them to the store
- R3. Config values are stored in the credential store (keyring or file backend) alongside tokens
- R4. `auth0-tv login --reconfigure` forces re-prompting even when config is already stored
- R5. Non-login commands (`connect`, `status`, `connections`, `disconnect`, gmail commands) resolve config from env vars first, then the store, and error with "Run `auth0-tv login` first" if neither is available
- R6. `auth0-tv logout` clears tokens and connections but preserves stored config
- R7. The `~/.auth0-tv/config.json` file is no longer required for Auth0 credentials (the `storage` field may remain there for backend selection)

## Scope Boundaries

- Do not remove `config.json` support for the `storage` field — that must be resolvable before the backend is initialized
- Do not change the PKCE flow, token exchange logic, or any Auth0 API interactions
- Do not add external prompting libraries — use Node.js built-in `readline/promises` (already used in `gmail/helpers.ts`)
- Do not implement migration of existing `config.json` credentials into the store

## Context & Research

### Relevant Code and Patterns

- `src/utils/config.ts` — Current `loadConfig()` with env-var-then-file precedence; `resolveStorageBackend()` for storage field
- `src/commands/login.ts` — Calls `loadConfig()` at the top of the action handler
- `src/commands/connect.ts` — Calls `loadConfig()` for token exchange
- `src/commands/gmail/helpers.ts` — Calls `loadConfig()` in `createGmailClient()`; also uses `readline/promises` for confirmation prompts (pattern to follow for config prompts)
- `src/store/backend.ts` — `CredentialBackend` interface
- `src/store/keyring-backend.ts` — `KeyringBackend` using keytar with service name `auth0-tv`
- `src/store/credential-store.ts` — `FileBackend` and `CredentialStore` facade
- `auth0-mcp-server/src/utils/keychain.ts` — Stores domain as a separate keychain entry (`AUTH0_DOMAIN`)

## Key Technical Decisions

- **Add `getConfig()` / `saveConfig()` to `CredentialBackend`:** Config is structurally different from tokens (no expiry, survives logout). Separate methods keep the interface clean and allow `clear()` to skip config.
- **Store config as a single JSON entry:** `KeyringBackend` stores under account `AUTH0_CONFIG`, `FileBackend` stores in the existing `credentials.json` under a `config` key. Simpler than individual entries and matches the `AUTH0_TOKENS` pattern.
- **Env vars bypass the store entirely:** When env vars are present, they're used directly without reading from or writing to the store. This keeps CI/automation environments stateless.
- **`readline/promises` for prompting:** Already used in the project (`gmail/helpers.ts`). No new dependencies needed.
- **`--reconfigure` flag on login:** Cleaner than a separate command. Forces prompts even when config exists in the store.
- **Split `loadConfig()` into two functions:** `loadConfigFromEnv()` for env-only resolution (returns null if incomplete), and `loadConfigFromStore()` for store-based resolution. The login command orchestrates the full flow (env → store → prompt → save). Other commands use a simpler `requireConfig()` that tries env → store → error.

## Open Questions

### Resolved During Planning

- **Should logout clear config?** No — logout clears tokens/connections only. Config persists so next login skips prompts. `--reconfigure` flag allows updating stored config.
- **Where does the `storage` field live?** Stays in `config.json` or `AUTH0_TV_STORAGE` env var. It must be resolved before backend initialization, so it can't live in the backend itself.
- **Should `audience` be prompted?** Yes, but as optional — empty string skips it. Most users won't need it initially.

### Deferred to Implementation

- **Exact prompt wording and validation:** Implementation should validate domain format (no `https://` prefix, no trailing slash) and clientId/clientSecret are non-empty.
- **Whether `config.json` should still be read as a fallback:** For backwards compatibility, could keep reading it if store has no config and env vars aren't set. May be simpler to just prompt instead.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

```
Login flow (auth0-tv login [--reconfigure]):

  ┌─────────────────────────────┐
  │ Check AUTH0_DOMAIN,         │
  │ AUTH0_CLIENT_ID,            │
  │ AUTH0_CLIENT_SECRET env vars│
  └────────────┬────────────────┘
               │
        all set? ──yes──► Use env config (don't persist)
               │                         │
               no                        │
               │                         │
  ┌────────────▼────────────────┐        │
  │ Check store.getConfig()     │        │
  │ (unless --reconfigure)      │        │
  └────────────┬────────────────┘        │
               │                         │
        found? ──yes──► Use stored config│
               │                    │    │
               no                   │    │
               │                    │    │
  ┌────────────▼────────────────┐  │    │
  │ Prompt: domain, clientId,   │  │    │
  │         clientSecret,       │  │    │
  │         audience (optional) │  │    │
  └────────────┬────────────────┘  │    │
               │                   │    │
  ┌────────────▼────────────────┐  │    │
  │ store.saveConfig(config)    │  │    │
  └────────────┬────────────────┘  │    │
               │                   │    │
               ▼                   ▼    ▼
        ┌──────────────────────────────┐
        │ runPkceFlow({ config })      │
        │ store.saveAuth0Tokens(...)   │
        └──────────────────────────────┘


Non-login commands (connect, gmail, etc.):

  env vars? ──yes──► use them
      │
      no
      │
  store.getConfig()? ──yes──► use it
      │
      no
      │
  Error: "Not configured. Run `auth0-tv login` first."
```

## Implementation Units

- [x] **Unit 1: Extend CredentialBackend with config methods**

  **Goal:** Add `getConfig()` and `saveConfig()` to the backend interface. Implement in both `FileBackend` and `KeyringBackend`. Ensure `clear()` does NOT touch config.

  **Requirements:** R3, R6

  **Dependencies:** None (builds on existing backend infrastructure)

  **Files:**
  - Modify: `auth0-token-vault-cli/src/store/backend.ts`
  - Modify: `auth0-token-vault-cli/src/store/credential-store.ts` (FileBackend + facade)
  - Modify: `auth0-token-vault-cli/src/store/keyring-backend.ts`
  - Modify: `auth0-token-vault-cli/src/store/types.ts` (add `StoredConfig` type)
  - Test: `auth0-token-vault-cli/test/store/credential-store.test.ts`
  - Test: `auth0-token-vault-cli/test/store/keyring-backend.test.ts`

  **Approach:**
  - Add a `StoredConfig` type to `types.ts` with `domain`, `clientId`, `clientSecret`, `audience?`
  - Add `getConfig(): Promise<StoredConfig | null>` and `saveConfig(config: StoredConfig): Promise<void>` to `CredentialBackend`
  - `KeyringBackend`: store under account `AUTH0_CONFIG` as JSON
  - `FileBackend`: store in `credentials.json` under a `config` key in the `CredentialData` structure
  - `CredentialStore` facade: delegate `getConfig()` / `saveConfig()` to backend
  - `clear()` on both backends must NOT delete config — only tokens and connections

  **Patterns to follow:**
  - `AUTH0_TOKENS` account pattern in `KeyringBackend`
  - `CredentialData` structure in `FileBackend`

  **Test scenarios:**
  - Save and retrieve config through both backends
  - Config survives `clear()` (tokens wiped, config remains)
  - Returns null when no config stored
  - Corrupt config JSON returns null (keyring backend)
  - All existing tests still pass

  **Verification:**
  - All existing tests pass unchanged
  - New config tests pass for both backends

- [x] **Unit 2: Refactor config resolution — split loadConfig into env, store, and prompt paths**

  **Goal:** Replace the monolithic `loadConfig()` with composable functions: env-only resolution, store-based resolution, and a `requireConfig()` for non-login commands.

  **Requirements:** R2, R5, R7

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `auth0-token-vault-cli/src/utils/config.ts`
  - Test: `auth0-token-vault-cli/test/utils/config.test.ts`

  **Approach:**
  - `loadConfigFromEnv(): Auth0Config | null` — returns config if all three required env vars are set, null otherwise
  - `loadConfigFromStore(store: CredentialStore): Promise<Auth0Config | null>` — reads `store.getConfig()`, maps `StoredConfig` to `Auth0Config`
  - `requireConfig(store: CredentialStore): Promise<Auth0Config>` — tries env, then store, throws descriptive error if neither works. This is what connect/gmail/status commands will call.
  - Keep `resolveStorageBackend()` unchanged
  - The original `loadConfig()` can be removed or kept as a thin wrapper that calls `requireConfig`

  **Patterns to follow:**
  - Current `loadConfig()` env-var precedence pattern
  - Error messages matching current style

  **Test scenarios:**
  - `loadConfigFromEnv` returns config when all env vars set
  - `loadConfigFromEnv` returns null when any env var missing
  - `loadConfigFromStore` returns config from store
  - `loadConfigFromStore` returns null when store is empty
  - `requireConfig` prefers env over store
  - `requireConfig` throws helpful error when neither available
  - `AUTH0_AUDIENCE` env var is optional in all paths

  **Verification:**
  - Config resolution tests pass
  - No command files changed yet

- [x] **Unit 3: Add interactive config prompting to login command**

  **Goal:** During `auth0-tv login`, prompt the user for config values when not available from env vars or the store. Add `--reconfigure` flag. Save prompted values to the store.

  **Requirements:** R1, R4

  **Dependencies:** Unit 1, Unit 2

  **Files:**
  - Modify: `auth0-token-vault-cli/src/commands/login.ts`
  - Create: `auth0-token-vault-cli/src/utils/prompt.ts`
  - Test: `auth0-token-vault-cli/test/commands/login.test.ts`

  **Approach:**
  - Create `prompt.ts` with a `promptForConfig()` function using `readline/promises` (same pattern as `gmail/helpers.ts`)
  - Prompt for: domain (required), clientId (required), clientSecret (required), audience (optional, press Enter to skip)
  - Login command flow: check env → check store (skip if `--reconfigure`) → prompt → save to store → proceed with PKCE
  - Register `--reconfigure` as a boolean option on the login command
  - `promptForConfig` should write to `process.stderr` for prompts (not stdout) to keep stdout clean for JSON output

  **Patterns to follow:**
  - `readline/promises` usage in `src/commands/gmail/helpers.ts`
  - Commander option registration pattern in existing commands

  **Test scenarios:**
  - Login with env vars skips prompts entirely
  - Login with stored config skips prompts
  - Login with `--reconfigure` re-prompts even when config is stored
  - Prompted config is saved to the store
  - After prompt + save, PKCE flow receives correct config
  - Empty audience treated as undefined

  **Verification:**
  - Login command works end-to-end: prompts on first run, skips on subsequent runs
  - `--reconfigure` forces new prompts
  - Existing login tests still pass

- [x] **Unit 4: Update non-login commands to use requireConfig**

  **Goal:** Replace `loadConfig()` calls in connect, gmail helpers, and any other commands with `requireConfig(store)`.

  **Requirements:** R5

  **Dependencies:** Unit 2, Unit 3

  **Files:**
  - Modify: `auth0-token-vault-cli/src/commands/connect.ts`
  - Modify: `auth0-token-vault-cli/src/commands/gmail/helpers.ts`
  - Test: `auth0-token-vault-cli/test/integration/cli.test.ts`

  **Approach:**
  - Each command already creates a `CredentialStore` instance — pass it to `requireConfig(store)` instead of calling `loadConfig()`
  - Error message when config is missing: `"Not configured. Run \`auth0-tv login\` first."`
  - Connect command and gmail helpers both need the same change pattern

  **Patterns to follow:**
  - Current `loadConfig()` call sites

  **Test scenarios:**
  - Connect with env vars works (no store needed for config)
  - Connect without env vars or stored config shows helpful error
  - Gmail commands use stored config from previous login
  - Integration tests for credential flow still pass

  **Verification:**
  - All existing tests pass (they set env vars or use temp dirs)
  - No command requires `config.json` for Auth0 credentials anymore

## System-Wide Impact

- **Interaction graph:** All commands that call `loadConfig()` are affected: `login.ts`, `connect.ts`, `gmail/helpers.ts`. The `CredentialStore` constructor and `resolveStorageBackend()` are NOT affected.
- **Error propagation:** `requireConfig()` throws a clear error that maps to the existing `EXIT_AUTH_REQUIRED` code path. Commands already have try/catch blocks that handle this.
- **State lifecycle risks:** Config and tokens now share the same backend but have independent lifecycles (clear doesn't touch config). FileBackend must handle the expanded `CredentialData` shape without breaking existing credential files that lack a `config` key.
- **API surface parity:** `CredentialBackend` interface gains two methods — both backends must implement them.

## Risks & Dependencies

- **Backwards compatibility:** Users with existing `config.json` files will need to run `auth0-tv login` once to migrate their config into the store. The old file won't be read for Auth0 credentials anymore. This is acceptable since the CLI is pre-1.0.
- **stdin availability:** Prompting requires an interactive terminal. If stdin is not a TTY (piped input, CI), prompting will fail. The `requireConfig` path (env vars → store → error) handles non-interactive cases. Login should check `process.stdin.isTTY` before prompting and error with "Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET environment variables for non-interactive use" if not a TTY.
- **Secret visibility:** `readline/promises` echoes input by default. `clientSecret` should ideally not be echoed. Implementation should investigate using raw mode or a simple mask for the secret prompt.

## Sources & References

- Related code: `auth0-token-vault-cli/src/utils/config.ts` (current implementation)
- Related code: `auth0-token-vault-cli/src/commands/gmail/helpers.ts` (readline/promises pattern)
- Related code: `auth0-mcp-server/src/utils/keychain.ts` (stores domain in keychain)
