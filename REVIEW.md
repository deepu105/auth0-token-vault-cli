# Code Review: auth0-token-vault-cli

**Scope:** Full codebase review — `src/`, `test/`, config files
**Reviewers:** Correctness, Reliability, Security, Testing, Maintainability (all 5 completed)
**Test suite:** 144/144 passing
**Date:** 2026-03-27

---

## P0 — Must Fix

### 1. `authSession` used before assignment in Connected Accounts flow

**File:** `src/auth/connected-accounts.ts:215,245`
**Found by:** Correctness, Reliability

`authSession` is declared on line 245 but referenced on line 215 inside the HTTP callback handler. If the callback fires before `initiateConnect` resolves (unlikely but possible with fast redirects or replayed requests), `authSession` is `undefined`, causing a silent failure in `completeConnect`.

**Fix:** Move `authSession` into a closure or use a deferred promise pattern so the callback blocks until initiation completes.

**autofix_class:** `gated_auto` — behavioral change in async flow

---

### 2. Cached connection tokens returned without checking `requiredScopes`

**File:** `src/auth/token-exchange.ts:45-49`
**Found by:** Correctness

`exchangeForConnectionToken` accepts `requiredScopes` but the cache lookup on lines 45-49 returns stored tokens without verifying they cover the requested scopes. An agent requesting `gmail.send` could receive a token that only has `gmail.readonly`.

**Fix:** Compare `requiredScopes` against `cached.scopes` before returning cached tokens.

**autofix_class:** `safe_auto`

---

## P1 — Should Fix

### 3. FileBackend swallows non-ENOENT read errors → silent credential wipeout

**File:** `src/store/credential-store.ts:93-98`
**Found by:** Reliability, Maintainability

`FileBackend.load()` catches all errors and returns an empty `CredentialData` object for any failure (permission denied, corrupted JSON, disk full). The next `save()` call then overwrites the file with empty data, destroying credentials.

**Fix:** Only catch `ENOENT`; rethrow other errors.

**autofix_class:** `safe_auto`

---

### 4. `console.log` bypasses output system, corrupts `--json` stdout

**Files:** `src/auth/pkce-flow.ts:128`, `src/auth/connected-accounts.ts:252`
**Found by:** Maintainability, Correctness

Two raw `console.log` calls emit human text to stdout during auth flows. When `--json` is active, this interleaves non-JSON text into the stream, breaking agent consumers.

**Fix:** Show these message only when not in `--json` mode, or route them through the `output()` system with a special type.

**autofix_class:** `safe_auto`

---

### 5. Status command expiry check inconsistent with store

**File:** `src/commands/status.ts:48`
**Found by:** Maintainability, Correctness

`status` compares `expiresAt` against `Date.now()` directly, while `CredentialStore` uses a 5-minute `EXPIRY_BUFFER_MS`. A token can show "valid" in status but be treated as expired by every other command.

**Fix:** Apply the same `EXPIRY_BUFFER_MS` in the status check, preferably export the helper from the store to reuse.

**autofix_class:** `safe_auto`

---

### 6. No tests for login, logout, connect commands

**Files:** `src/commands/login.ts`, `src/commands/logout.ts`, `src/commands/connect.ts`
**Found by:** Testing

These three commands have zero test coverage. They contain significant logic (config resolution, token persistence, browser flow orchestration, error handling with exit codes).

**autofix_class:** `manual`

---

### 7. `connect` command emits multiple JSON objects to stdout

**File:** `src/commands/connect.ts:61-113`
**Found by:** Correctness, Maintainability

In `--json` mode, `connect` calls `output()` up to 4 times (connecting → account_linked → warning/connected), emitting multiple JSON objects. Consumers expecting a single JSON response will fail.

**Fix:** Accumulate state and emit a single final `output()`.

**autofix_class:** `safe_auto`

---

### 8. `handleGmailError` missing 403 → EXIT_AUTHORIZATION_REQUIRED mapping

**File:** `src/commands/gmail/helpers.ts`
**Found by:** Correctness, Reliability

403 errors from Gmail API (insufficient scopes) fall through to `EXIT_SERVICE_ERROR` instead of `EXIT_AUTHORIZATION_REQUIRED`. Agents can't distinguish "reconnect needed" from "service broken".

**Fix:** Add `case 403:` mapping to `EXIT_AUTHORIZATION_REQUIRED`.

**autofix_class:** `safe_auto`

---

### 9. No timeout on fetch calls or OIDC discovery

**Files:** `src/auth/connected-accounts.ts` (3 fetch calls), `src/auth/token-exchange.ts`, `src/auth/token-refresh.ts`, `src/auth/oidc-config.ts`
**Found by:** Reliability

All `fetch()` calls and `client.discovery()` lack `AbortSignal.timeout()`. A hung Auth0 endpoint will block the CLI indefinitely.

**Fix:** Add `signal: AbortSignal.timeout(30_000)` to all external HTTP calls.

**autofix_class:** `safe_auto`

---

### 10. Duplicate service ↔ connection mapping tables

**Files:** `src/commands/connect.ts:12`, `src/commands/disconnect.ts`, `src/commands/connections.ts`
**Found by:** Maintainability

Three separate files maintain their own `SERVICE_MAP` / `SERVICE_TO_CONNECTION` / `CONNECTION_TO_SERVICE` mappings. Adding a new service requires editing all three.

**Fix:** Extract a single canonical mapping to a shared module.

**autofix_class:** `safe_auto`

---

## P2 — Fix If Straightforward

### 11. `allowInsecureRequests` scoped too broadly

**File:** `src/auth/oidc-config.ts`
**Found by:** Security

`allowInsecureRequests` is passed based on `localhost` in the domain, but it's applied to the entire `openid-client` configuration, not just the redirect URI. In dev/testing, this disables TLS verification for the Auth0 tenant too.

**Fix:** Explore options and ask for approval

**autofix_class:** `gated_auto`

---

### 12. API error extraction pattern duplicated 4 times

**Files:** `src/auth/connected-accounts.ts` (lines 83-85, 117-119, 294-296, 322-324)
**Found by:** Maintainability

Identical `res.json().catch(() => ({}))` + `.message ?? HTTP ${res.status}` pattern repeated 4 times.

**Fix:** Extract a `throwOnHttpError(res, context)` helper.

**autofix_class:** `safe_auto`

---

### 13. `ExchangeOptions` type exported but never used

**File:** `src/auth/token-exchange.ts`
**Found by:** Maintainability

The `ExchangeOptions` interface is exported but not consumed by any caller.

**autofix_class:** `safe_auto`

---

### 14. Path traversal check in `resolveBody` bypassable via symlink

**File:** `src/commands/gmail/helpers.ts`
**Found by:** Security

`resolveBody` uses `path.resolve()` + `startsWith(process.cwd())` to block directory traversal. A symlink inside cwd pointing outside it passes this check. Low risk for a CLI tool, but worth noting.

**Fix:** Document the limitation in a comment.

**autofix_class:** `advisory`

---

### 15. Domain input not validated

**File:** `src/utils/prompt.ts` (`cleanDomain`)
**Found by:** Security

`cleanDomain` strips protocol and trailing slashes but doesn't validate the result is a proper domain. A value like `"; rm -rf /` would be interpolated into URLs. Low risk since it's used in URL constructors that would reject it, but defense-in-depth suggests a regex check.

**Fix:** Document the limitation in a comment.

**autofix_class:** `advisory`

---

### 16. `GmailClient` parsing functions use `any` types

**File:** `src/services/gmail/client.ts`
**Found by:** Maintainability, Testing

Multiple helper functions (`parseMessage`, `parseLabel`, etc.) accept and return `any`. This defeats TypeScript's type checking for the entire Gmail data pipeline.

**autofix_class:** `manual`

---

### 17. KeyringBackend.clear() swallows all errors

**File:** `src/store/keyring-backend.ts`
**Found by:** Reliability

`clear()` wraps everything in try/catch and silently ignores failures. If keyring deletion fails, the user believes they logged out but credentials persist.

**autofix_class:** `safe_auto`

---

### 18. No tests for `src/utils/callback-port.ts`

**File:** `src/utils/callback-port.ts` (new, staged file)
**Found by:** Testing

New utility with no test coverage.

**autofix_class:** `manual`

---

### 19. Round-trip verification scaffolding in KeyringBackend

**File:** `src/store/keyring-backend.ts`
**Found by:** Maintainability

Debug-level read-back verification after every write. Consider removing or gating behind `DEBUG`.

---

## P3 — User's Discretion

### 20. Network error detection via string matching

**Files:** `src/commands/login.ts:56`, `src/commands/gmail/helpers.ts`
**Found by:** Maintainability

`message.includes('ECONNREFUSED')` is fragile. Consider checking `err.cause?.code` or using a typed error check.

### 21. `bindServer` retry logic has no jitter or backoff

**File:** `src/auth/browser.ts`
**Found by:** Reliability

Port binding tries ports sequentially with no delay. Fine for 6 ports, but worth noting.

## Summary

| Severity | Count | Key themes                                                                |
| -------- | ----- | ------------------------------------------------------------------------- |
| **P0**   | 2     | Race condition in auth flow, scope-blind token cache                      |
| **P1**   | 8     | Silent data loss, stdout corruption, missing tests, inconsistent behavior |
| **P2**   | 8     | Security hardening, code duplication, type safety                         |
| **P3**   | 3     | Minor quality improvements                                                |

**Top priorities:** Fix P0 #1 and #2 first — both are correctness bugs that affect core functionality. Then P1 #3 (silent credential wipeout) and #4 (JSON output corruption) as they directly impact the agent-consumption use case this CLI is designed for.
