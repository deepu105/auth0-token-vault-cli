---
title: "feat: Show remote connections with local indicator, local-first disconnect with remote flag"
type: feat
status: active
date: 2026-03-27
---

# feat: Show remote connections with local indicator, local-first disconnect with remote flag

## Overview

Enhance the `connections` command to fetch the remote connected accounts list from Auth0 (via `listConnectedAccounts`) and indicate which ones also have locally-cached tokens. Enhance the `disconnect` command to use `deleteConnectedAccount` for remote deletion, but default to local-only removal with an opt-in `--remote` flag.

## Problem Frame

Currently, `connections` only shows locally-cached token entries — it has no visibility into what's actually linked on the Auth0 side. A user who connected a service but whose local token expired or was cleared sees nothing. Conversely, `disconnect` only removes the local token cache, leaving the remote connected account intact with no way to clean it up from the CLI.

## Requirements Trace

- R1. `connections` fetches the remote connected accounts list via `listConnectedAccounts`
- R2. Each remote connection shows an indicator of whether a locally-cached token also exists
- R3. `disconnect` defaults to local-only deletion (removes cached token, preserves remote link)
- R4. `disconnect --remote` additionally calls `deleteConnectedAccount` to remove the server-side link
- R5. All output continues to support dual-mode (human-readable + `--json`)

## Scope Boundaries

- No changes to the `connect` command
- No new service mappings (still just gmail/google-oauth2)
- No caching of the remote accounts list
- No changes to the credential store backend interface

## Context & Research

### Relevant Code and Patterns

- `src/commands/connections.ts` — current local-only connections listing
- `src/commands/disconnect.ts` — current local-only disconnect
- `src/auth/connected-accounts.ts` — `listConnectedAccounts()` and `deleteConnectedAccount()` already implemented and tested but unused by commands
- `src/commands/connect.ts` — shows the pattern for requiring auth, getting config, and using `connected-accounts.ts` functions
- `src/utils/output.ts` — `output()` / `outputError()` dual-mode output helpers
- `src/utils/config.ts` — `requireConfig()` for loading Auth0 config
- `src/utils/exit-codes.ts` — exit code constants
- `test/auth/connected-accounts.test.ts` — existing tests for `listConnectedAccounts` and `deleteConnectedAccount`
- `test/mocks/handlers.js` — MSW handlers including My Account API token exchange and connected accounts endpoint

### Institutional Learnings

- The CLI already has the remote API functions fully implemented and tested — this work is purely about wiring them into the command layer

## Key Technical Decisions

- **Remote list is the primary source for `connections`**: The command fetches from Auth0, then cross-references against local store to add the `localTokenStatus` indicator. This ensures users see all linked accounts, not just ones with local tokens.
- **Graceful degradation when not logged in**: If the user has no refresh token (not logged in), `connections` should fall back to local-only mode rather than erroring, since listing connections is a read-only informational command.
- **`--remote` flag on disconnect rather than `--local`**: Local deletion is the safe default (non-destructive to the server-side link). The `--remote` flag opts in to the more impactful action. This follows the CLI's pattern of safe defaults for destructive operations.
- **`disconnect --remote` requires both the service name and resolving the connected account ID**: Since `deleteConnectedAccount` takes an account ID (e.g., `ca_abc123`), the command must first call `listConnectedAccounts` to find the account ID for the given connection name.

## Open Questions

### Resolved During Planning

- **Should `connections` require login?** No — it should work gracefully in degraded mode (local-only) when not logged in. When logged in, it fetches remote and cross-references with local.
- **Should `disconnect --remote` also remove the local token?** Yes — removing the remote link without clearing the local cache would leave a stale orphaned token. `--remote` means "fully disconnect", which does both.

### Deferred to Implementation

- **What if `listConnectedAccounts` returns a connection unknown to `CONNECTION_TO_SERVICE`?** Show the raw connection name as the service name (the existing fallback pattern: `CONNECTION_TO_SERVICE[conn] ?? conn`).

## Implementation Units

- [ ] **Unit 1: Enhance `connections` command to show remote accounts with local indicator**

  **Goal:** Fetch the remote connected accounts list and merge with local token status so users see all linked accounts and know which ones have locally-cached tokens.

  **Requirements:** R1, R2, R5

  **Dependencies:** None

  **Files:**
  - Modify: `src/commands/connections.ts`
  - Create: `test/commands/connections.test.ts`

  **Approach:**
  - Import `listConnectedAccounts` from `../auth/connected-accounts.js`, `requireConfig` from `../utils/config.js`
  - Create the credential store, attempt to load config and auth tokens
  - If refresh token is available: call `listConnectedAccounts(config, refreshToken)` to get the remote list, then for each remote account, check if a local connection entry exists via `store.getConnectionEntry(conn.connection)` and compute token status (valid/expired/none)
  - If refresh token is NOT available (not logged in): fall back to the current local-only behavior
  - Build the output shape with fields: `connection`, `service`, `id` (from remote, if available), `scopes`, `tokenStatus` (local token: `valid` | `expired` | `none`), `remote` (boolean, true when from remote list)
  - Human output: show indicator like `[local: valid]` or `[local: none]` next to each service
  - Wrap the remote API call in try/catch — if it fails (network error, etc.), fall back to local-only with a warning

  **Patterns to follow:**
  - `src/commands/connect.ts` lines 44-56 for the `requireConfig` + auth token retrieval pattern
  - Existing `connections.ts` for output formatting and `CONNECTION_TO_SERVICE` mapping

  **Test scenarios:**
  - Remote returns accounts, some with local tokens and some without — verify merged output with correct `tokenStatus` indicators
  - Remote returns accounts but no local tokens exist — all show `tokenStatus: 'none'`
  - Not logged in (no refresh token) — falls back to local-only listing
  - Remote API call fails — falls back to local-only with a warning
  - No connections remotely or locally — empty list message

  **Verification:**
  - `connections` shows remote accounts with local token status indicators in both human and JSON output modes
  - Falls back gracefully when not authenticated or when the API call fails

- [ ] **Unit 2: Enhance `disconnect` command with `--remote` flag**

  **Goal:** Default `disconnect` to local-only token removal. Add `--remote` flag that also calls `deleteConnectedAccount` to remove the server-side link.

  **Requirements:** R3, R4, R5

  **Dependencies:** None (can be implemented independently of Unit 1)

  **Files:**
  - Modify: `src/commands/disconnect.ts`
  - Create: `test/commands/disconnect.test.ts`

  **Approach:**
  - Add `.option('--remote', 'Also remove the server-side connection (Auth0 Token Vault)')` to the commander definition
  - Default behavior (no `--remote`): unchanged — `store.removeConnection(connection)` only
  - With `--remote`: require login (refresh token), call `listConnectedAccounts` to find the account ID matching the connection name, then call `deleteConnectedAccount(config, refreshToken, accountId)`, then also call `store.removeConnection(connection)` for local cleanup
  - If `--remote` but account not found in remote list: still remove local, output a warning that no remote account was found
  - If `--remote` API call fails: remove local, output error about remote failure but don't exit with error code (partial success)
  - Import `listConnectedAccounts`, `deleteConnectedAccount` from `../auth/connected-accounts.js`, `requireConfig` from `../utils/config.js`

  **Patterns to follow:**
  - `src/commands/connect.ts` for the `requireConfig` + auth check pattern
  - Existing `disconnect.ts` for output formatting
  - `src/commands/disconnect.ts` existing shape and error handling

  **Test scenarios:**
  - Default (no `--remote`): removes local token only, no API calls
  - `--remote`: removes local token AND calls `deleteConnectedAccount` with correct account ID
  - `--remote` but not logged in: error with `auth_required` code
  - `--remote` but account not found in remote list: removes local, warns about no remote account
  - `--remote` API error: removes local, reports remote failure
  - Unknown service: unchanged error behavior

  **Verification:**
  - `disconnect gmail` removes only the local token (no network calls)
  - `disconnect gmail --remote` removes both local token and remote connected account
  - JSON output includes `remote: true/false` to indicate whether remote deletion occurred

## System-Wide Impact

- **API surface parity:** The `--json` output shape for `connections` changes (adds `id`, `remote`, changes `tokenStatus` to include `'none'`). Agents consuming the JSON output will see richer data — this is additive and backward-compatible since `connection`, `service`, `scopes`, and `tokenStatus` fields are preserved.
- **Error propagation:** Remote API failures in `connections` degrade gracefully to local-only. In `disconnect --remote`, remote failures are reported as warnings while local cleanup still succeeds.
- **Integration coverage:** Command-level tests with MSW will cover the remote API integration paths.

## Risks & Dependencies

- **Auth0 My Account API availability:** The `listConnectedAccounts` endpoint must be available in the user's Auth0 tenant. This is already a dependency of the `connect` command, so no new risk.
- **Account ID resolution for disconnect:** `deleteConnectedAccount` requires the account ID, not the connection name. The disconnect command must call `listConnectedAccounts` first to resolve it. This adds one extra API call when `--remote` is used.

## Sources & References

- `src/auth/connected-accounts.ts` — `listConnectedAccounts` (L283-301), `deleteConnectedAccount` (L306-326)
- `test/auth/connected-accounts.test.ts` — existing unit tests for both functions
- `test/mocks/handlers.js` — MSW handlers for My Account API
