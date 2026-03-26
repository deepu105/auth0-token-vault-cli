---
title: 'Add browser logout to auth0-tv logout'
type: feat
status: completed
date: 2026-03-25
---

# Add browser logout to auth0-tv logout

## Overview

When running `auth0-tv logout`, open the browser to Auth0's `/v2/logout` endpoint to end the Auth0 session in the browser. Currently, only local credentials are cleared — the browser session persists, which means the next `login` auto-authenticates without prompting.

## Problem Frame

After `auth0-tv logout`, the user expects to be fully logged out. But the Auth0 session cookie in the browser remains, so the next `auth0-tv login` silently re-authenticates as the same user. This is confusing and makes it impossible to switch accounts without manually clearing browser cookies.

## Requirements Trace

- R1. `auth0-tv logout` opens the browser to `https://{domain}/v2/logout?client_id={clientId}` to end the Auth0 session
- R2. Browser logout is best-effort — if config is unavailable (e.g. env vars not set, store already cleared), skip browser logout and still clear local credentials
- R3. A `--local` flag skips browser logout and only clears local credentials (for CI/scripting use)

## Scope Boundaries

- Do not implement federated logout (ending the upstream IdP session, e.g. Google). Auth0's `/v2/logout` only ends the Auth0 session.
- Do not wait for the browser action to complete — fire-and-forget is sufficient
- Do not add a callback server for logout — no redirect needed

## Context & Research

### Relevant Code and Patterns

- `src/commands/logout.ts` — current logout command, clears store only
- `src/auth/pkce-flow.ts` — uses `open` package to launch browser, pattern to follow
- `src/utils/config.ts` — `requireConfig(store)` and `mergeConfigFromEnvAndStore()` for loading domain/clientId
- Auth0 logout endpoint: `GET https://{domain}/v2/logout?client_id={clientId}`

## Key Technical Decisions

- **Best-effort browser logout**: Read config before clearing the store. If config is available, open the browser. If not (env vars missing, store empty), skip silently — local cleanup is the priority.
- **Fire-and-forget**: Use `open(url)` without awaiting confirmation. No callback server needed — Auth0 shows a "logged out" page.
- **`--local` flag**: Skips browser logout entirely. Useful for CI, scripts, or when the user only wants to clear local credentials.

## Implementation Units

- [x] **Unit 1: Add browser logout to the logout command**

  **Goal:** Open Auth0's `/v2/logout` endpoint in the browser before clearing local credentials. Add `--local` flag to skip browser logout.

  **Requirements:** R1, R2, R3

  **Dependencies:** None

  **Files:**
  - Modify: `auth0-token-vault-cli/src/commands/logout.ts`
  - Test: `auth0-token-vault-cli/test/integration/cli.test.ts`

  **Approach:**
  - Before calling `store.clear()`, attempt to load config via `mergeConfigFromEnvAndStore(stored)` where `stored = await store.getConfig()`
  - If `domain` and `clientId` are available and `--local` is not set, open `https://{domain}/v2/logout?client_id={clientId}` using the `open` package
  - Then proceed with `store.clear()` as before
  - Register `--local` boolean option on the logout command

  **Patterns to follow:**
  - `open(url)` usage in `src/auth/pkce-flow.ts`
  - Commander option pattern from `login.ts` (`--reconfigure`)

  **Test scenarios:**
  - `logout --help` shows `--local` flag
  - `logout --local` does not attempt browser open (integration test can verify exit code only)

  **Verification:**
  - Running `auth0-tv logout` opens the browser to the Auth0 logout URL then clears local credentials
  - Running `auth0-tv logout --local` clears local credentials without opening the browser
  - If no config is available, logout still succeeds (local cleanup only)

## Risks & Dependencies

- **Browser opening in headless environments**: `open` may fail silently in CI/headless. This is fine — the `--local` flag exists for these cases, and browser open failure should not block local credential clearing.
