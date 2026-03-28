---
title: "refactor: Simplify CLI via shared service infrastructure and API passthrough analysis"
type: refactor
status: completed
date: 2026-03-28
---

# Simplify CLI via Shared Service Infrastructure and API Passthrough Analysis

## Overview

The CLI has grown to 4 services (Gmail, Calendar, Slack, GitHub) with ~30 command files following identical boilerplate patterns. This plan consolidates duplicated infrastructure (client factories, error handlers, command wrappers, utilities) into shared abstractions, and adds a `token` command for lightweight API passthrough — all without breaking the existing typed command interface.

## Problem Frame

Each new service requires ~4 boilerplate files (helpers.ts, index.ts, per-command files) that are near-identical copies of existing services. The `helpers.ts` files across all four services share ~80% identical code (client factory, error handling skeleton). Every command action repeats the same `try { createClient; callAPI; output } catch { handleError }` pattern. Utility functions like `truncate()` are copy-pasted across all four formatter files. This makes the codebase harder to maintain and slower to extend.

## Requirements Trace

- R1. Eliminate duplicated client factory code across all 4 service `helpers.ts` files
- R2. Consolidate common error handling logic into a shared base with per-service classifiers
- R3. Extract duplicated utilities (`truncate`) to a shared location
- R4. Create a higher-order command action wrapper to eliminate repeated try/catch boilerplate
- R5. Derive connection strings from the service registry instead of hardcoding per-helpers file
- R6. Analyze API passthrough options with feasibility assessment, deliver the most practical one
- R7. All existing typed commands must continue to work unchanged
- R8. Tests must continue to pass; shared infrastructure gets its own tests

## Scope Boundaries

- This refactor does **not** change any service client implementations (`src/services/*/client.ts`)
- This refactor does **not** change any service type definitions or formatters beyond extracting `truncate()`
- This refactor does **not** remove or rename existing typed commands
- The `token` command is additive — new file, not a modification of existing commands

## Context & Research

### Relevant Code and Patterns

- `src/commands/shared-helpers.ts` — existing shared helper extraction (`requireConfirmation`, `resolveBody`)
- `src/commands/*/helpers.ts` — 4 near-identical files: client factory + error handler + re-exports
- `src/utils/service-registry.ts` — canonical service→connection mapping (already has `getConnectionForService()`)
- `src/auth/token-exchange.ts` — `exchangeForConnectionToken()` + `TokenExchangeError` class
- `src/utils/output.ts` — `output()` / `outputError()` used by all commands
- `src/utils/exit-codes.ts` — exit code constants shared across all error handlers

### Duplication Inventory

| Pattern | Copies | Impact |
|---------|--------|--------|
| Client factory (`createXxxClient`) | 4 | ~8 identical lines each, only connection string + class differ |
| Error handler common skeleton | 4 | TokenExchangeError + network error + fallback = ~15 identical lines each |
| Gmail/Calendar error handlers | 2 | Byte-for-byte identical except service name strings |
| `truncate()` utility | 4 | Identical 3-line function in every `formatters.ts` |
| Command action try/catch wrapper | ~25+ | Same 8-line pattern in every command file |
| Connection string constants | 4 | Duplicate what `service-registry.ts` already knows |

## Key Technical Decisions

- **Generic client factory parameterized by class + service name**: A single `createServiceClient(ServiceClass, serviceName)` function replaces 4 identical factory functions. It looks up the connection string from the service registry, eliminating the hardcoded `CONNECTION` constants.

- **Composable error handler with per-service classifiers**: A shared `handleServiceError(err, cmd, serviceName, classifyError?)` handles the universal prefix (TokenExchangeError, network errors) and suffix (fallback to SERVICE_ERROR), with an optional callback for service-specific status code mapping.

- **`withServiceAction()` higher-order wrapper**: Wraps the repeated try/catch + createClient + handleError pattern into a single function that command registrations call. Each command's action body becomes just the API call and output formatting.

- **Token-only passthrough (`auth0-tv token <service>`)**: After evaluating all three passthrough options:
  - **Option 1 (generic `api` subcommand)**: Not feasible — each SDK has a different method dispatch pattern (googleapis uses chained resource methods, Octokit uses nested objects, Slack uses flat methods). Dynamically routing CLI args to arbitrary SDK methods raises security risks (arbitrary method execution, injection) and provides poor discoverability (no `--help`, no validation). Would require an allowlist per service, at which point you've rebuilt the typed commands.
  - **Option 2 (replace typed commands)**: Loses all DX benefits — `--help` text, argument validation, human-readable formatters, destructive action confirmation, and agent skill discoverability via the manifest. Unacceptable trade-off.
  - **Option 3 (token-only)**: Simple, secure, maximally flexible. `auth0-tv token <service>` returns a fresh access token to stdout. Agents and power users can use it with any SDK or curl. ~30 lines to implement. This is the right call — it's additive, doesn't replace typed commands, and covers the "I need an action we don't have a command for" use case perfectly.

- **Preserve existing per-service `helpers.ts` as thin delegators**: Rather than deleting the per-service helpers files, reduce them to thin one-liner delegators that import from shared infrastructure. This preserves all existing import paths, avoiding a mass-rename across command files and tests.

## Open Questions

### Resolved During Planning

- **Should the service registry be the source of truth for connection strings?** Yes. The generic factory will call `getConnectionForService(serviceName)` instead of using hardcoded constants. This fulfills the original registry design intent of "adding a service is a single-file change."

- **Should per-service helpers.ts files be deleted?** No. Keep them as thin files that configure the shared infrastructure for their service. This avoids changing import paths in ~25 command files and their tests.

- **Should the `token` command output format be configurable?** It always outputs the raw token to stdout in plain mode. With `--json` it wraps in `{ token, connection, expiresAt }`. This makes it pipeable and agent-friendly.

### Deferred to Implementation

- Exact method signature shape for the per-service error classifier callback — will be refined when implementing against the actual error shapes
- Whether `withServiceAction()` should accept the formatter as a parameter or leave formatting in the action body — depends on whether a clean API emerges

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
BEFORE (per-service helpers.ts — 4 copies):
┌─────────────────────────────────┐
│ helpers.ts (gmail)              │
│  CONNECTION = 'google-oauth2'   │ ← hardcoded, duplicates registry
│  createGmailClient()           │ ← ~8 lines, identical pattern
│  handleGmailError()            │ ← ~35 lines, 70% shared
│  re-exports from shared        │
└─────────────────────────────────┘
  × 4 services = ~300 lines of mostly-duplicate code

AFTER:
┌──────────────────────────────────────────────┐
│ src/commands/service-helpers.ts (NEW shared)  │
│  createServiceClient(Class, svcName, cmd)    │ ← generic factory, registry lookup
│  handleServiceError(err, cmd, svcName, fn?)  │ ← shared skeleton + classifier hook
│  withServiceAction(svcName, Class, action)   │ ← HOF command wrapper
│  classifyGoogleError(err)                    │ ← reusable for Gmail + Calendar
│  classifySlackError(err)                     │
│  classifyGitHubError(err)                    │
└──────────────────────────────────────────────┘

┌────────────────────────────────────┐
│ src/commands/gmail/helpers.ts      │  ← thin delegator (preserves imports)
│  createGmailClient = (cmd) =>     │
│    createServiceClient(            │
│      GmailClient, 'gmail', cmd)   │
│  handleGmailError = (err, cmd) => │
│    handleServiceError(             │
│      err, cmd, 'gmail',           │
│      classifyGoogleError)         │
└────────────────────────────────────┘
  × 4 services = ~40 lines total (down from ~300)
```

## Implementation Units

- [ ] **Unit 1: Extract shared `truncate()` utility**

**Goal:** Eliminate the 4 copies of `truncate()` across formatter files.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Create: `src/utils/format-helpers.ts`
- Modify: `src/services/gmail/formatters.ts`
- Modify: `src/services/calendar/formatters.ts`
- Modify: `src/services/slack/formatters.ts`
- Modify: `src/services/github/formatters.ts`
- Test: `test/utils/format-helpers.test.ts`

**Approach:**
- Move `truncate()` to new shared utility file
- Replace local copies with imports in all 4 formatters
- Add basic tests for truncation edge cases (empty string, exact length, over length)

**Patterns to follow:**
- Existing utilities in `src/utils/` (e.g., `output.ts`, `exit-codes.ts`)

**Test scenarios:**
- String shorter than max returns unchanged
- String at exactly max length returns unchanged
- String over max is truncated with ellipsis
- Empty string returns empty

**Verification:**
- All 4 formatters import from `src/utils/format-helpers.ts`
- No local `truncate()` functions remain in any formatter file
- Existing formatter tests still pass

- [ ] **Unit 2: Create shared service helpers infrastructure**

**Goal:** Build the generic client factory, composable error handler, and per-service error classifiers in a single shared file.

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**
- Create: `src/commands/service-helpers.ts`
- Test: `test/commands/service-helpers.test.ts`

**Approach:**
- `createServiceClient<T>(ClientClass, serviceName, cmd)`: creates `CredentialStore`, calls `requireConfig`, looks up connection via `getConnectionForService(serviceName)`, returns `new ClientClass(tokenGetter)`
- `handleServiceError(err, cmd, serviceName, classifyError?)`: handles TokenExchangeError (delegate to `err.exitCode`), network errors (ECONNREFUSED/fetch failed → EXIT_NETWORK_ERROR), then calls optional `classifyError(err)` for service-specific mapping, and falls back to EXIT_SERVICE_ERROR
- Error classifier type: `(err: unknown) => { code: string; message: string; exitCode: number } | undefined` — returns undefined if the error isn't service-specific
- Export `classifyGoogleError`, `classifySlackError`, `classifyGitHubError` — each encapsulates the service-specific error detection logic currently in the per-service handlers
- Gmail and Calendar both use `classifyGoogleError` (they're currently identical except for the service name string, which now comes from the `serviceName` parameter)

**Patterns to follow:**
- `src/commands/shared-helpers.ts` — existing shared extraction pattern
- `src/utils/service-registry.ts` — registry lookup pattern

**Test scenarios:**
- Generic factory creates client with correct token getter wired to the right connection
- TokenExchangeError is handled with the error's own exit code
- Network errors (ECONNREFUSED, fetch failed) map to EXIT_NETWORK_ERROR
- Google API 401/403 errors are classified correctly
- Slack error codes (not_authed, missing_scope, channel_not_found) are classified correctly
- GitHub 401/403/404 errors are classified correctly
- Unknown errors fall through to EXIT_SERVICE_ERROR
- `serviceName` is correctly interpolated into error messages (e.g., "Run `auth0-tv connect gmail`")

**Verification:**
- All error handling behaviors from the 4 existing handlers are covered by tests on the shared infrastructure
- `classifyGoogleError` is used for both Gmail and Calendar

- [ ] **Unit 3: Migrate per-service helpers to thin delegators**

**Goal:** Replace the bulk of each per-service `helpers.ts` with calls to the shared infrastructure, preserving all existing export names and import paths.

**Requirements:** R1, R2, R5, R7

**Dependencies:** Unit 2

**Files:**
- Modify: `src/commands/gmail/helpers.ts`
- Modify: `src/commands/calendar/helpers.ts`
- Modify: `src/commands/slack/helpers.ts`
- Modify: `src/commands/github/helpers.ts`
- Test: `test/commands/gmail/helpers.test.ts`
- Test: `test/commands/calendar/helpers.test.ts`
- Test: `test/commands/slack/helpers.test.ts`
- Test: `test/commands/github/helpers.test.ts`

**Approach:**
- Each helpers file becomes a thin module that imports from `../service-helpers.ts` and re-exports bound versions:
  - `createGmailClient(cmd)` → `createServiceClient(GmailClient, 'gmail', cmd)`
  - `handleGmailError(err, cmd)` → `handleServiceError(err, cmd, 'gmail', classifyGoogleError)`
- Keep re-exports of `requireConfirmation` and `resolveBody` unchanged
- Keep any service-specific helpers (e.g., `parseOwnerRepo` in GitHub's helpers) in place
- Existing per-service helper tests should continue to pass since the behavior is identical

**Patterns to follow:**
- Current re-export pattern in helpers.ts (`export { requireConfirmation } from '../shared-helpers.js'`)

**Test scenarios:**
- All existing helper tests pass without modification (or with minimal import adjustments)
- Client factory produces correct client type for each service
- Error handler produces correct exit codes for each service's error shapes

**Verification:**
- No command file import paths change
- `npm run test` passes with no failures
- Each per-service helpers.ts is under ~15 lines (down from ~70-100)

- [ ] **Unit 4: Create `withServiceAction()` higher-order wrapper**

**Goal:** Eliminate the repeated try/catch + createClient + handleError boilerplate from command action functions.

**Requirements:** R4, R7

**Dependencies:** Unit 2

**Files:**
- Modify: `src/commands/service-helpers.ts`
- Test: `test/commands/service-helpers.test.ts`

**Approach:**
- Add `withServiceAction<T>(serviceName, ClientClass, classifyError?, action)` to service-helpers
- The wrapper: creates client, calls the action callback with `(client, opts, cmd)`, catches errors with `handleServiceError`
- Returns a function matching Commander's action signature
- Command files can use it, but this unit only adds the wrapper — migration of commands is optional and can be done incrementally

**Patterns to follow:**
- Commander.js action handler signature: `(args..., opts, cmd) => Promise<void>`

**Test scenarios:**
- Wrapper calls action with a valid client instance
- Wrapper catches errors and delegates to handleServiceError
- Wrapper propagates the serviceName correctly

**Verification:**
- `withServiceAction` is exported and tested
- At least one command file is updated as a proof-of-concept to validate the API ergonomics

- [ ] **Unit 5: Add `auth0-tv token <service>` command**

**Goal:** Provide a lightweight API passthrough mechanism that returns a fresh access token for any connected service.

**Requirements:** R6

**Dependencies:** None (can be done in parallel with units 1-4)

**Files:**
- Create: `src/commands/token.ts`
- Modify: `src/index.ts`
- Test: `test/commands/token.test.ts`

**Approach:**
- New command: `auth0-tv token <service>` where service is any registered service name
- Validates service name against `getAvailableServices()` from the service registry
- Uses `requireConfig` + `exchangeForConnectionToken` to get a fresh token
- Plain mode: outputs raw token to stdout (no newline prefix, just the token — suitable for `$(auth0-tv token github)`)
- JSON mode: outputs `{ "token": "...", "connection": "google-oauth2", "service": "gmail" }`
- Errors: uses the standard exit codes (EXIT_AUTH_REQUIRED if not logged in, EXIT_AUTHZ_REQUIRED if not connected)
- Does NOT support `--scope` or custom connections — uses the registry's connection for the named service

**Patterns to follow:**
- `src/commands/connect.ts` — validates service name, uses credential store and token exchange
- `src/commands/status.ts` — simple command registration pattern

**Test scenarios:**
- Valid service name returns a token (mock token exchange)
- Invalid service name exits with EXIT_INVALID_INPUT and helpful message listing available services
- Not logged in exits with EXIT_AUTH_REQUIRED
- Not connected exits with EXIT_AUTHZ_REQUIRED
- JSON mode wraps token in expected structure
- Token is written to stdout (not stderr) for shell capture compatibility

**Verification:**
- `auth0-tv token github` returns a usable token
- `auth0-tv token --json github` returns structured JSON
- `auth0-tv token nonexistent` exits with error listing available services
- Command appears in `auth0-tv --help` output

- [ ] **Unit 6: Update agent skill manifest**

**Goal:** Document the new `token` command in the skill manifest so AI agents can discover and use it.

**Requirements:** R6

**Dependencies:** Unit 5

**Files:**
- Modify: `skills/auth0-token-vault/references/commands.md`
- Modify: `skills/auth0-token-vault/SKILL.md`

**Approach:**
- Add `token` command to the command reference with usage, options, and examples
- Add a note in the skill overview explaining when agents should use `token` vs typed commands
- Recommended pattern for agents: use typed commands for common operations (they have better error handling and human-readable output), use `token` when needing to perform an action not covered by existing commands

**Verification:**
- Command reference includes complete `token` command documentation
- Skill manifest mentions `token` as an option for advanced/uncovered use cases

## System-Wide Impact

- **Interaction graph:** The shared `service-helpers.ts` becomes a dependency of all 4 per-service helpers files. Changes to the shared error handling logic affect all services simultaneously.
- **Error propagation:** Error classification callbacks are the extension point. A new service adds its classifier; the common skeleton handles the rest.
- **API surface parity:** All existing CLI commands maintain their exact same behavior and output. The `token` command is additive.
- **Integration coverage:** Per-service helper tests validate the composition of shared + service-specific logic. The shared infrastructure has its own unit tests.

## Risks & Dependencies

- **Risk: Subtle error behavior differences after migration** — The per-service error handlers have minor differences (e.g., GitHub checks `404`, Slack has `extractSlackErrorCode`). Mitigation: the error classifier pattern preserves these differences explicitly, and existing per-service tests act as regression guards.
- **Risk: Token command security** — Tokens on stdout could be captured in shell history or logs. Mitigation: this is standard practice (cf. `gcloud auth print-access-token`, `gh auth token`, `aws sts get-session-token`). Add a `--quiet` note in docs.
- **Dependency: Service registry completeness** — The generic factory relies on `getConnectionForService()` returning the correct connection. All 4 services are already registered.

## Sources & References

- Related plan: `docs/plans/2026-03-27-003-fix-p1-review-findings-plan.md` — established service registry as single source of truth
- Related plan: `docs/plans/2026-03-28-001-feat-google-calendar-and-slack-services-plan.md` — established the per-service helpers pattern and previous shared-helpers extraction
- Prior art for token commands: `gh auth token`, `gcloud auth print-access-token`, `aws sts get-session-token`
