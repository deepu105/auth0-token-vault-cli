---
title: "fix: Connect command does not persist connection to credential store"
type: fix
status: active
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md
---

# fix: Connect command does not persist connection to credential store

## Overview

After running `auth0-tv connect gmail`, the `connections` and `status` commands report no connected services. The connect flow completes the PKCE authorization successfully and saves updated Auth0 tokens, but never records the connection in the credential store.

## Problem Frame

The `connect` command runs the PKCE flow with `connection=google-oauth2` and gets back Auth0 tokens. It saves those tokens via `store.saveAuth0Tokens()` — but never calls `store.saveConnectionToken()`. The `connections` and `status` commands rely on `store.listConnections()`, which reads from `data.connections` in the credential file. Since nothing is written there, the connection is invisible.

The connection token only gets saved later when `exchangeForConnectionToken()` is called during a Gmail command (e.g., `gmail search`). So the connection "appears" only after the first Gmail operation.

## Requirements Trace

- R4. `auth0-tv connections` lists connected services (see origin)
- R5. `auth0-tv status` shows connected services (see origin)
- R3. `auth0-tv connect <service>` should visibly register the connection (see origin)

## Scope Boundaries

- Fix the connect command to persist connection state
- Update disconnect to match the new storage approach
- Do not change the PKCE flow itself
- Do not change the token exchange implementation

## Key Technical Decisions

- **Perform token exchange immediately after connect:** After the PKCE flow completes and Auth0 tokens are saved, call `exchangeForConnectionToken()` to get the Gmail access token. This validates the connection works end-to-end, caches the token for immediate use, and makes the connection visible to `connections`/`status`. The alternative — storing a "registration" record without a token — would add a new concept to the store for no real benefit, and wouldn't validate the connection actually works.

## Implementation Units

- [ ] **Unit 1: Add token exchange to connect command and update tests**

  **Goal:** After PKCE flow completes, exchange for the connection token so it's persisted in the credential store and visible to `connections`/`status`.

  **Requirements:** R3, R4, R5

  **Dependencies:** None

  **Files:**
  - Modify: `auth0-token-vault-cli/src/commands/connect.ts`
  - Modify: `auth0-token-vault-cli/test/commands/status.test.ts`
  - Modify: `auth0-token-vault-cli/test/integration/cli.test.ts`

  **Approach:**
  - In `connect.ts`, after saving Auth0 tokens, call `exchangeForConnectionToken(config, store, mapping.connection)` to immediately exchange for and cache the service token
  - The existing `exchangeForConnectionToken` already handles caching via `store.saveConnectionToken()`, so no changes needed to the store or token-exchange module
  - If the token exchange fails after a successful connect PKCE flow, treat it as a warning rather than a hard failure — the Auth0 tokens are already saved, and the user can retry the exchange via a Gmail command
  - Update the status and integration tests to verify that after a simulated connect, `store.listConnections()` returns the connection

  **Patterns to follow:**
  - `auth0-token-vault-cli/src/auth/token-exchange.ts` — existing `exchangeForConnectionToken` function
  - `auth0-token-vault-cli/src/commands/gmail/helpers.ts` — how Gmail commands create the token exchange flow

  **Test scenarios:**
  - After connect, `store.listConnections()` includes `google-oauth2`
  - After connect, `store.getConnectionToken('google-oauth2')` returns a valid token
  - `connections` command lists gmail after connect
  - `status` command shows gmail in connected services after connect
  - If token exchange fails after connect, Auth0 tokens are still saved and a warning is shown (not a hard error)

  **Verification:**
  - `auth0-tv connect gmail` → `auth0-tv connections` shows gmail as connected
  - `auth0-tv connect gmail` → `auth0-tv status` shows gmail in connected services
  - All existing tests continue to pass
