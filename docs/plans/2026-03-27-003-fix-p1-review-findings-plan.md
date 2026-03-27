---
title: 'fix: Address P1 review findings — reliability, consistency, and quality'
type: fix
status: completed
date: 2026-03-27
origin: REVIEW.md
---

# fix: Address P1 review findings — reliability, consistency, and quality

## Overview

Eight P1 findings from the full codebase review. Covers silent data loss in FileBackend, stdout corruption in JSON mode, inconsistent expiry checks, missing error mappings, absent fetch timeouts, duplicate service mappings, multiple JSON objects from `connect`, and missing test coverage for core commands.

## Problem Frame

These findings range from data-loss risk (FileBackend swallowing errors) to agent-mode correctness (`console.log` corrupting JSON stdout, multiple JSON objects from `connect`) to reliability gaps (no fetch timeouts). Each is independently fixable and well-bounded.

## Requirements Trace

- R1. FileBackend must not silently discard non-ENOENT errors (finding #3)
- R2. Auth flows must not emit raw `console.log` to stdout — use `log()` debug channel (finding #4)
- R3. Status command expiry check must use the same `EXPIRY_BUFFER_MS` as the store (finding #5)
- R4. Login, logout, and connect commands must have test coverage (finding #6)
- R5. `connect` command must emit a single JSON object in `--json` mode (finding #7)
- R6. `handleGmailError` must map 403 to `EXIT_AUTHORIZATION_REQUIRED` (finding #8)
- R7. All external HTTP calls must have a timeout via `AbortSignal.timeout()` (finding #9)
- R8. Service-to-connection mappings must live in a single shared module (finding #10)

## Scope Boundaries

- P0 items already fixed in prior plan
- P2/P3 items deferred
- No changes to public command interfaces or exit code values
- Test coverage for #6 (R4) targets error paths and flow orchestration, not full integration with browser flows

## Key Technical Decisions

- **R2: Replace `console.log` with `log()` (debug channel)** — These messages are useful for debugging but should never appear in stdout. The `log()` function from `src/utils/logger.ts` uses the `debug` package which writes to stderr only when `DEBUG` is set. This is the right channel.
- **R4: Test login/logout/connect at the command handler level** — Mock `runPkceFlow`, `runConnectedAccountFlow`, and `openBrowserLogout` to test the command logic (config resolution, store persistence, error handling, exit codes) without browser interaction.
- **R5: Accumulate status in connect, emit once** — Remove intermediate `output()` calls. Use human-readable `process.stderr.write` for progress messages when not in JSON mode, and emit a single `output()` at the end.
- **R7: 30-second timeout for fetch, 15-second for OIDC discovery** — OIDC discovery is cached and only needed once; fetch calls are per-operation. Both should fail fast rather than hang.
- **R8: Shared service registry module** — A single `src/utils/service-registry.ts` that exports the canonical mapping, forward/reverse lookup helpers, and the scopes per service. All three command files import from it.

## Open Questions

### Resolved During Planning

- **Should `console.log` in auth flows become `output()` calls?** No — they lack access to the Commander `cmd` object and shouldn't appear in JSON output at all. Route to `log()` (debug/stderr).
- **Should connect command suppress all intermediate human output in JSON mode?** Yes — emit progress to stderr for humans, single JSON object to stdout.
- **Where should the fetch timeout constant live?** In a new constant in `src/auth/oidc-config.ts` since that module is imported by all auth modules. Or simply inline `AbortSignal.timeout(30_000)` at each call site — cleaner since the value is self-documenting.

### Deferred to Implementation

- **Exact test helper structure for mocking login/logout flows** — Depends on vitest mock ergonomics once implementation starts.

## Implementation Units

- [ ] **Unit 1: Fix FileBackend to rethrow non-ENOENT errors**

  **Goal:** Prevent silent credential wipeout when file read fails for reasons other than "file not found."

  **Requirements:** R1

  **Dependencies:** None

  **Files:**
  - Modify: `src/store/credential-store.ts`
  - Test: `test/store/credential-store.test.ts`

  **Approach:**
  - In `FileBackend.load()`, the catch block currently returns empty data for all errors. Change to only catch `ENOENT` and rethrow everything else (permission denied, JSON parse error, etc.).
  - The `JSON.parse` failure case should also throw (corrupted file) rather than silently returning empty data.

  **Patterns to follow:**
  - The existing `clear()` method in the same class already does `if (code !== 'ENOENT') throw err` — match that pattern.

  **Test scenarios:**
  - File does not exist → returns empty `CredentialData` (existing behavior)
  - File contains invalid JSON → throws error (new behavior)
  - File exists with valid data → returns parsed data (existing behavior)

  **Verification:**
  - Existing credential store tests pass
  - New test confirms invalid JSON throws instead of returning empty data

- [ ] **Unit 2: Replace console.log with log() in auth flows**

  **Goal:** Stop corrupting `--json` stdout with raw text from auth flows.

  **Requirements:** R2

  **Dependencies:** None

  **Files:**
  - Modify: `src/auth/pkce-flow.ts`
  - Modify: `src/auth/connected-accounts.ts`

  **Approach:**
  - Replace `console.log(...)` on pkce-flow.ts line 128 with `log(...)` from the existing logger import.
  - Replace `console.log(...)` on connected-accounts.ts line 257 with `log(...)`.
  - Remove the `// eslint-disable-next-line` comments that were suppressing the no-console rule.

  **Patterns to follow:**
  - Both files already import `log` from `../utils/logger.js` and use it elsewhere.

  **Test scenarios:**
  - No new tests needed — these are debug messages. Existing flow tests confirm no regressions.

  **Verification:**
  - `npm run lint` passes (no more eslint-disable needed)
  - Existing auth flow tests pass

- [ ] **Unit 3: Use EXPIRY_BUFFER_MS in status command**

  **Goal:** Make the status command's expiry check consistent with the store's.

  **Requirements:** R3

  **Dependencies:** None

  **Files:**
  - Modify: `src/commands/status.ts`
  - Test: `test/commands/status.test.ts`

  **Approach:**
  - Import `EXPIRY_BUFFER_MS` from `../store/credential-store.js` (already exported).
  - Change `Date.now() >= auth0Tokens.expiresAt` to `Date.now() >= auth0Tokens.expiresAt - EXPIRY_BUFFER_MS`.
  - Note: `connections.ts` already imports and uses `EXPIRY_BUFFER_MS` correctly — follow that pattern.

  **Patterns to follow:**
  - `src/commands/connections.ts` line 15: `Date.now() >= entry.expiresAt - EXPIRY_BUFFER_MS`

  **Test scenarios:**
  - Token with `expiresAt` 1 minute from now → should show as expired (within buffer)
  - Token with `expiresAt` 3 minutes from now → should show as valid (outside buffer)

  **Verification:**
  - Existing status tests pass
  - New or updated test confirms buffer is applied

- [ ] **Unit 4: Add 403 mapping to handleGmailError**

  **Goal:** Map Gmail 403 errors to `EXIT_AUTHORIZATION_REQUIRED` so agents can trigger re-authorization.

  **Requirements:** R6

  **Dependencies:** None

  **Files:**
  - Modify: `src/commands/gmail/helpers.ts`
  - Test: `test/commands/gmail/helpers.test.ts`

  **Approach:**
  - Add a `statusCode === 403` check after the existing `statusCode === 401` check.
  - Map to `EXIT_AUTHZ_REQUIRED` (not `EXIT_AUTH_REQUIRED`) with a message indicating insufficient scopes.
  - Import `EXIT_AUTHZ_REQUIRED` from exit-codes.

  **Patterns to follow:**
  - The existing `statusCode === 401` block in the same function.

  **Test scenarios:**
  - Gmail error with code 403 → exits with `EXIT_AUTHZ_REQUIRED` (4)
  - Gmail error with code 401 → exits with `EXIT_AUTH_REQUIRED` (3) — existing test, confirm unchanged

  **Verification:**
  - Existing helpers tests pass
  - New test confirms 403 mapping

- [ ] **Unit 5: Add fetch timeouts to all external HTTP calls**

  **Goal:** Prevent the CLI from hanging indefinitely on unresponsive Auth0 endpoints.

  **Requirements:** R7

  **Dependencies:** None

  **Files:**
  - Modify: `src/auth/oidc-config.ts`
  - Modify: `src/auth/connected-accounts.ts`
  - Modify: `src/auth/token-exchange.ts`
  - Modify: `src/auth/token-refresh.ts`

  **Approach:**
  - Add `{ signal: AbortSignal.timeout(30_000) }` to all `fetch()` calls in connected-accounts.ts (3 calls in `initiateConnect`, `completeConnect`, `listConnectedAccounts`, `deleteConnectedAccount` — 4 total).
  - For `client.discovery()` in oidc-config.ts, check if openid-client supports a signal/timeout option. If not, wrap in `Promise.race` with a timeout.
  - For `client.genericGrantRequest()`, `client.refreshTokenGrant()`, `client.authorizationCodeGrant()`: check if they accept a signal option or need `Promise.race`.
  - The openid-client library functions use `fetch` internally and may accept request options — investigate during implementation.

  **Test scenarios:**
  - No new timeout-specific tests needed — the timeout is a safety net and existing MSW tests respond immediately. Verify no regressions.

  **Verification:**
  - All existing auth tests pass
  - Code inspection confirms all external calls have timeouts

- [ ] **Unit 6: Extract shared service registry**

  **Goal:** Eliminate duplicate service ↔ connection mappings across three command files.

  **Requirements:** R8

  **Dependencies:** None

  **Files:**
  - Create: `src/utils/service-registry.ts`
  - Modify: `src/commands/connect.ts`
  - Modify: `src/commands/disconnect.ts`
  - Modify: `src/commands/connections.ts`
  - Test: `test/utils/service-registry.test.ts`

  **Approach:**
  - Create `src/utils/service-registry.ts` with a single `SERVICE_REGISTRY` data structure mapping service name → `{ connection, scopes }`.
  - Export helper functions: `getConnectionForService(service)`, `getServiceForConnection(connection)`, `getAvailableServices()`, `getScopesForService(service)`.
  - Update `connect.ts` to use `getConnectionForService` and `getScopesForService` instead of its local `SERVICE_MAP`.
  - Update `disconnect.ts` to use `getConnectionForService` instead of its local `SERVICE_TO_CONNECTION`.
  - Update `connections.ts` to use `getServiceForConnection` instead of its local `CONNECTION_TO_SERVICE`.
  - Remove the local mapping constants from all three files.

  **Patterns to follow:**
  - The existing mapping shape in `connect.ts` (includes scopes) is the most complete — use it as the canonical source.

  **Test scenarios:**
  - `getConnectionForService('gmail')` → `'google-oauth2'`
  - `getConnectionForService('unknown')` → `undefined`
  - `getServiceForConnection('google-oauth2')` → `'gmail'`
  - `getAvailableServices()` → `['gmail']`
  - Existing connect/disconnect/connections tests pass with no changes

  **Verification:**
  - New service registry tests pass
  - All existing command tests pass
  - No duplicate mapping constants remain in command files

- [ ] **Unit 7: Fix connect command to emit single JSON object**

  **Goal:** Make `connect` command emit exactly one JSON object in `--json` mode.

  **Requirements:** R5

  **Dependencies:** Unit 6 (service registry)

  **Files:**
  - Modify: `src/commands/connect.ts`

  **Approach:**
  - Remove intermediate `output()` calls for `connecting` and `account_linked` statuses.
  - Use `process.stderr.write()` for human-mode progress messages (checking `!cmd.optsWithGlobals().json`).
  - Emit a single final `output()` with the complete result (status, service, connection, scopes, any warnings).
  - For the token exchange warning case, include it as a `warning` field in the final output rather than a separate JSON object.

  **Patterns to follow:**
  - The `disconnect` command already emits a single `output()` at the end.

  **Test scenarios:**
  - Needs integration-level test or manual verification — the command currently has no tests (covered by R4 below).

  **Verification:**
  - Command logic emits at most one `output()` call per execution path

- [ ] **Unit 8: Add tests for login, logout, connect commands**

  **Goal:** Cover core command logic that currently has zero test coverage.

  **Requirements:** R4

  **Dependencies:** Unit 6, Unit 7 (connect command changes should be tested in final form)

  **Files:**
  - Create: `test/commands/login.test.ts`
  - Create: `test/commands/logout.test.ts`
  - Create: `test/commands/connect.test.ts`

  **Approach:**
  - Mock `runPkceFlow`, `runConnectedAccountFlow`, `openBrowserLogout` at the module level using `vi.mock()`.
  - Mock `resolveConfigWithPrompts` to return test config without interactive prompts.
  - Use a temp-directory `CredentialStore` (same pattern as token-exchange tests).
  - Test command registration and action execution via Commander's `parseAsync`.

  **Patterns to follow:**
  - `test/commands/disconnect.test.ts` — uses MSW + CredentialStore with temp dir
  - `test/commands/status.test.ts` — tests command output structure

  **Test scenarios:**
  - **login:** successful login saves tokens; already-logged-in emits warning then re-authenticates; network error exits with `EXIT_NETWORK_ERROR`
  - **logout:** logged-in user gets credentials cleared; not-logged-in emits `not_logged_in`; `--local` skips browser logout
  - **connect:** successful connect + exchange; unknown service exits with `EXIT_INVALID_INPUT`; not-logged-in exits with `EXIT_AUTH_REQUIRED`; exchange failure emits warning but doesn't crash

  **Verification:**
  - All new tests pass
  - Full test suite passes

## System-Wide Impact

- **Error propagation:** FileBackend now throws on corrupted files — callers (CredentialStore methods) will propagate the error. Command handlers already catch errors generically, so this surfaces corruption rather than silently losing data.
- **API surface parity:** Service registry centralizes mappings — adding a new service becomes a single-file change.
- **State lifecycle:** The connect command change affects JSON output shape — any downstream consumers should be updated (the agent skill doc in `skills/auth0-token-vault/references/commands.md` may need a note).

## Risks & Dependencies

- **FileBackend behavior change (R1):** Users with corrupted credential files will now see errors instead of silent re-initialization. This is the correct behavior — surfacing the problem is better than losing data.
- **Connect command JSON shape change (R5):** If any agent consumers already parse the multi-object stream, they'll need updating. Low risk since this is a new CLI.
- **openid-client timeout support (R7):** Need to verify at implementation time whether `client.discovery()`, `client.genericGrantRequest()`, etc. accept timeout/signal options or need wrapping.

## Sources & References

- Origin document: [REVIEW.md](../../REVIEW.md) — P1 findings #3 through #10
- Related code: `src/store/credential-store.ts`, `src/auth/pkce-flow.ts`, `src/auth/connected-accounts.ts`, `src/commands/status.ts`, `src/commands/connect.ts`, `src/commands/disconnect.ts`, `src/commands/connections.ts`, `src/commands/gmail/helpers.ts`, `src/auth/oidc-config.ts`
