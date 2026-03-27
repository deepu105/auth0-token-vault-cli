---
title: "fix: Resolve P0 authSession race condition and scope-blind token cache"
type: fix
status: completed
date: 2026-03-27
origin: REVIEW.md
---

# fix: Resolve P0 authSession race condition and scope-blind token cache

## Overview

Two P0 correctness bugs identified during full codebase review. Both affect core auth flows — one is a race condition in the Connected Accounts flow, the other returns cached tokens that may lack required scopes.

## Problem Frame

**P0 #1 — `authSession` used before guaranteed assignment:** In `runConnectedAccountFlow`, the HTTP callback handler (line 215) references `authSession` which is declared on line 245 and assigned asynchronously after the server starts listening. If the callback fires before `initiateConnect` resolves, `authSession` is `undefined`, and the `completeConnect` call will fail silently or send garbage to the API.

**P0 #2 — Cached tokens returned without scope validation:** `exchangeForConnectionToken` checks the cache on lines 45-49 and returns early if a cached token exists, but never checks whether the cached token's scopes cover `options.requiredScopes`. An agent requesting `gmail.send` could receive a token that only has `gmail.readonly`.

## Requirements Trace

- R1. The Connected Accounts flow must not use `authSession` before it has been assigned
- R2. `exchangeForConnectionToken` must validate `requiredScopes` against cached tokens, not only freshly exchanged tokens

## Scope Boundaries

- Only fixing the two P0 items; P1+ deferred to separate work
- No changes to the public API surface of either function

## Context & Research

### Relevant Code and Patterns

- `src/auth/connected-accounts.ts` — `runConnectedAccountFlow` uses a Promise constructor wrapping `createServer`. The `authSession` variable is hoisted via `let` and assigned in the `.then()` chain after `bindServer` resolves. The callback handler closes over it.
- `src/auth/token-exchange.ts` — `exchangeForConnectionToken` has scope validation on lines 111-122 but only for freshly exchanged tokens. Cache path on lines 44-49 bypasses it entirely.
- `src/store/credential-store.ts` — `getConnectionToken` returns `string | null` (just the access token). `getConnectionEntry` returns the full `ConnectionToken` including `scopes[]`.
- `test/auth/token-exchange.test.ts` — Existing test at line 83 ("returns cached token without making a request") seeds a cached token with scopes but doesn't test the `requiredScopes` interaction.
- `test/auth/connected-accounts.test.ts` — `runConnectedAccountFlow` tests use a `vi.mock('open')` that simulates browser callback by fetching the redirect URI. The mock `connectInitiateHandler` captures `redirect_uri` and `state`.

## Key Technical Decisions

- **P0 #1: Use a deferred promise for `authSession`** rather than restructuring the entire flow. This is the minimal change: create a `Promise<string>` that the `.then()` chain resolves, and `await` it in the callback handler before calling `completeConnect`. This preserves the existing server/browser pattern used in `pkce-flow.ts`.
- **P0 #2: Read the full `ConnectionToken` entry from cache** using `store.getConnectionEntry()` (already exists), then check `requiredScopes` against `entry.scopes` before returning. If scopes are insufficient, skip cache and re-exchange. This reuses the existing scope validation logic pattern from lines 111-122.

## Open Questions

### Resolved During Planning

- **Should the scope check invalidate the cache entry?** No — the cached token may be valid for other callers with different scope requirements. Just skip the cache and re-exchange for this request.
- **Should the `authSession` fix change the server lifecycle?** No — the deferred promise pattern is minimal and keeps the same overall structure.

### Deferred to Implementation

- None — both fixes are well-bounded.

## Implementation Units

- [ ] **Unit 1: Fix `authSession` race condition with deferred promise**

  **Goal:** Ensure `authSession` is always assigned before the callback handler uses it.

  **Requirements:** R1

  **Dependencies:** None

  **Files:**
  - Modify: `src/auth/connected-accounts.ts`
  - Test: `test/auth/connected-accounts.test.ts`

  **Approach:**
  - Replace the `let authSession: string` declaration with a deferred promise pattern: create a `let resolveAuthSession` function and a `const authSessionPromise = new Promise<string>(r => { resolveAuthSession = r; })`.
  - In the `.then()` after `initiateConnect`, call `resolveAuthSession(initResult.auth_session)` instead of assigning the variable.
  - In the callback handler, `await authSessionPromise` before calling `completeConnect`.
  - If `initiateConnect` fails (caught in `.catch()`), the promise rejection propagates via the existing `settle(() => reject(err))` path — the callback handler won't fire because the browser URL was never opened.

  **Patterns to follow:**
  - The existing `settle`/`shutdown` pattern in the same function
  - Promise-based deferred patterns are idiomatic in this codebase (e.g., the outer `new Promise` in `runConnectedAccountFlow` and `runPkceFlow`)

  **Test scenarios:**
  - Existing tests already cover the happy path and error paths; verify they still pass (the mock `open` calls `fetch(redirectUri)` synchronously after initiate resolves, so the race window is zero in tests — but the fix ensures correctness regardless of timing)
  - No new test needed: the race condition is a timing bug that can't be reliably reproduced in unit tests. The fix is structural — making it impossible rather than unlikely.

  **Verification:**
  - All existing `runConnectedAccountFlow` tests pass
  - Code inspection confirms `authSession` is no longer used before assignment

- [ ] **Unit 2: Validate `requiredScopes` against cached connection tokens**

  **Goal:** Prevent returning cached tokens that lack the scopes the caller needs.

  **Requirements:** R2

  **Dependencies:** None (can be done in parallel with Unit 1)

  **Files:**
  - Modify: `src/auth/token-exchange.ts`
  - Test: `test/auth/token-exchange.test.ts`

  **Approach:**
  - Replace `store.getConnectionToken(connection)` (returns `string | null`) with `store.getConnectionEntry(connection)` (returns `ConnectionToken | null`) in the cache check.
  - After confirming the entry is non-null and not expired (the facade already handles expiry, but `getConnectionEntry` returns the raw entry — check `expiresAt` against the store's buffer if needed), check `requiredScopes` against `entry.scopes` before returning `entry.accessToken`.
  - If scopes are insufficient, log a debug message and fall through to re-exchange.
  - Note: `getConnectionToken` already checks expiry via `CredentialStore.isExpired()`. Since we're switching to `getConnectionEntry`, we need to either use `getConnectionToken` for expiry + separately read scopes, or check expiry ourselves. Simplest: keep using `getConnectionToken` for the expiry-checked access token, and additionally call `getConnectionEntry` only when `requiredScopes` is provided, to compare scopes.

  **Patterns to follow:**
  - The existing scope validation on lines 111-122 of `token-exchange.ts`
  - Test patterns in `token-exchange.test.ts` (seed store with specific scopes, assert behavior)

  **Test scenarios:**
  - Cached token with matching scopes + `requiredScopes` → returns cached (existing test at line 83 can be enhanced)
  - Cached token with insufficient scopes + `requiredScopes` → skips cache, makes exchange request, returns fresh token
  - Cached token with no `requiredScopes` passed → returns cached as before (backward compatibility)
  - Cached token with empty scopes + `requiredScopes` → skips cache

  **Verification:**
  - All existing token-exchange tests pass
  - New tests confirm scope-aware cache behavior
  - `npm run typecheck` passes

## System-Wide Impact

- **API surface parity:** No changes to function signatures or return types
- **Error propagation:** Unchanged — both fixes maintain existing error paths
- **State lifecycle:** Cache miss on scope mismatch triggers a fresh token exchange, which then caches the new (broader-scoped) token. Subsequent calls with the same or narrower scopes will hit the updated cache.

## Risks & Dependencies

- **Low risk:** Both changes are narrowly scoped to the identified bug sites with no cascading effects
- The deferred promise pattern adds one `await` in the hot path of the callback handler; negligible performance impact

## Sources & References

- Origin document: [REVIEW.md](../../REVIEW.md) — P0 findings #1 and #2
- Related code: `src/auth/connected-accounts.ts`, `src/auth/token-exchange.ts`
