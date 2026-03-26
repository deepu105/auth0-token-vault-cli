---
title: 'Granular Gmail scopes, storage type in status, browser selection'
type: feat
status: completed
date: 2026-03-26
---

# Granular Gmail scopes, storage type in status, browser selection

## Overview

Three targeted improvements: (1) replace the broad Gmail scopes in `connect.ts` with granular scopes so users can select which permissions to grant during the Google consent screen, (2) show the credential store backend type in the `status` command output, (3) allow users to choose which browser opens for auth flows via `AUTH0_TV_BROWSER` env var or `--browser` flag.

## Requirements Trace

- R1. `auth0-tv connect gmail` requests granular Gmail scopes instead of broad ones, letting users select/deselect individual permissions during the Google OAuth consent screen
- R2. `auth0-tv status` shows the active storage backend (`keyring` or `file`) in both human and JSON output
- R3. Auth flows (`login`, `connect`, `logout`) respect `AUTH0_TV_BROWSER` env var and `--browser` global flag to open a specific browser

## Scope Boundaries

- Do not persist browser preference in the credential store — env var and flag are sufficient
- Do not change any Auth0 tenant configuration

## Context & Research

### Relevant Code and Patterns

- `src/commands/connect.ts` — `SERVICE_MAP` with hardcoded `connectionScope` string
- `src/commands/status.ts` — current status output with JSON data object and human-readable lines
- `src/utils/config.ts` — `resolveStorageBackend()` as pattern for env-based resolution
- `src/auth/pkce-flow.ts` — `open(authorizeUrl)` call at end of `runPkceFlow()`
- `src/auth/browser.ts` — `open(logoutUrl)` in `openBrowserLogout()`
- `src/index.ts` — global Commander options (`--json`, `--confirm`)
- `open` package v10+ supports `{ app: { name: 'firefox' } }` option

## Key Technical Decisions

- **Granular scopes replace broad ones:** Current scopes (`gmail.modify`, `gmail.compose`, `gmail.labels`) are replaced with the minimum set that covers all CLI operations. Google's consent screen shows each scope individually, so requesting granular scopes lets users see and deselect permissions they don't want to grant.
- **Scope selection for Gmail:**
  - `gmail.readonly` — search, read messages
  - `gmail.send` — send, reply, forward
  - `gmail.compose` — create/manage drafts
  - `gmail.modify` — labels, archive, delete
  - `gmail.labels` — view/edit labels (non-sensitive)
- **No CLI flags needed:** The Google consent screen itself is the selection mechanism. We just request the full granular list and the user chooses which to approve.
- **`AUTH0_TV_BROWSER` env var + `--browser` flag:** Follows the same pattern as `AUTH0_TV_STORAGE`. The `open` package's `app.name` option handles cross-platform browser resolution.
- **`resolveStorageBackend()` in status:** Just call the existing function — no need to expose backend type through the `CredentialStore` facade.

## Implementation Units

- [x] **Unit 1: Replace broad Gmail scopes with granular scopes**

  **Goal:** Replace the current broad `gmail.modify` + `gmail.compose` + `gmail.labels` scopes with granular scopes that map to individual CLI capabilities. Google's consent screen will show each scope individually, letting users approve or deny specific permissions.

  **Requirements:** R1

  **Dependencies:** None

  **Files:**
  - Modify: `src/commands/connect.ts`

  **Approach:**
  - Replace the `connectionScope` array in `SERVICE_MAP.gmail` with granular scopes:
    - `https://www.googleapis.com/auth/gmail.readonly` (search, read)
    - `https://www.googleapis.com/auth/gmail.send` (send, reply, forward)
    - `https://www.googleapis.com/auth/gmail.compose` (drafts)
    - `https://www.googleapis.com/auth/gmail.modify` (labels, archive, delete)
    - `https://www.googleapis.com/auth/gmail.labels` (view/edit labels)
  - No CLI flags needed — the change is just in the scope list passed to Auth0/Google
  - No changes needed in `pkce-flow.ts` — it already passes `connectionScope` as-is

  **Patterns to follow:**
  - Existing `SERVICE_MAP` structure in `connect.ts`

  **Test scenarios:**
  - Default connect still works end-to-end
  - Authorize URL contains all five granular scopes

  **Verification:**
  - `auth0-tv connect gmail` opens the Google consent screen showing individual permissions (read, send, compose, etc.) instead of the broad "read, compose, and send email" bundle

- [x] **Unit 2: Show storage backend in status**

  **Goal:** Display the active credential store type (keyring or file) in the `status` command output.

  **Requirements:** R2

  **Dependencies:** None

  **Files:**
  - Modify: `src/commands/status.ts`
  - Test: `test/commands/status.test.ts`

  **Approach:**
  - Import `resolveStorageBackend` from config.ts
  - Add `storage` field to the JSON data object
  - Add a `Storage:` line to the human-readable output

  **Patterns to follow:**
  - Existing status output structure (JSON data object + human lines array)
  - `resolveStorageBackend()` in `src/utils/config.ts`

  **Test scenarios:**
  - Status JSON output includes `storage: "keyring"` or `storage: "file"`
  - Human output shows `Storage: keyring` line

  **Verification:**
  - `auth0-tv status` shows storage backend type
  - `auth0-tv status --json` includes `storage` field

- [x] **Unit 3: Browser selection via env var and global flag**

  **Goal:** Allow users to specify which browser to use for auth flows via `AUTH0_TV_BROWSER` env var or `--browser` global flag.

  **Requirements:** R3

  **Dependencies:** None

  **Files:**
  - Modify: `src/utils/config.ts` — add `resolveBrowser()` function
  - Modify: `src/auth/pkce-flow.ts` — pass browser app option to `open()`
  - Modify: `src/auth/browser.ts` — pass browser app option to `open()` in `openBrowserLogout()`
  - Modify: `src/index.ts` — add `--browser` global option
  - Test: `test/utils/config.test.ts`

  **Approach:**
  - Add `resolveBrowser()` to config.ts: checks `--browser` flag (via Commander), then `AUTH0_TV_BROWSER` env var, then returns undefined (system default)
  - The `open` package v10+ accepts `{ app: { name: 'firefox' } }` — pass this when a browser is specified
  - `runPkceFlow` and `openBrowserLogout` need to accept an optional browser parameter and pass it through to `open()`
  - Add `--browser <app>` as a global option on the root Commander program in `index.ts`
  - Pass the resolved browser value from commands down to the auth functions

  **Patterns to follow:**
  - `resolveStorageBackend()` pattern in config.ts for env var resolution
  - Global options pattern (`--json`, `--confirm`) in `index.ts`
  - `open()` options: `open(url, { app: { name: browserName } })`

  **Test scenarios:**
  - `--help` shows `--browser` option
  - `resolveBrowser()` returns env var value when set
  - `resolveBrowser()` returns undefined when no env var or flag

  **Verification:**
  - `AUTH0_TV_BROWSER=firefox auth0-tv login` opens Firefox
  - `auth0-tv login --browser firefox` opens Firefox
  - `auth0-tv login` without env/flag opens system default browser

## Risks & Dependencies

- **`open` package app name is platform-specific:** On Linux it's the executable name (e.g. `firefox`, `google-chrome`), on macOS it's the app name (e.g. `Firefox`, `Google Chrome`). The `open` package handles this but users need to know the right name for their OS. Document this in README.
- **Gmail commands may fail if user deselects scopes during consent:** e.g. `gmail send` will fail if user deselected send permission. Google's error will indicate the missing permission.
