---
title: "feat: Secure credential store with OS keyring"
type: feat
status: completed
date: 2026-03-25
---

# feat: Secure credential store with OS keyring

## Overview

Replace the plaintext JSON credential store (`~/.auth0-tv/credentials.json`) with OS keyring storage (macOS Keychain, Windows Credential Manager, Linux Secret Service) as the default backend, while keeping file-based storage available via configuration for environments without a keyring.

## Problem Frame

The CLI currently stores OAuth tokens — including refresh tokens and access tokens — as plaintext JSON in a file protected only by filesystem permissions (0600). Any process running as the current user can read these tokens. OS keyrings provide encrypted, access-controlled storage that is the industry standard for CLI credential management (used by GitHub CLI, Docker, auth0-mcp-server, etc.).

## Requirements Trace

- R1. Tokens (access, refresh, id, connection) are stored in the OS keyring by default
- R2. Users can choose between `keyring` and `file` storage backends via config or CLI flag
- R3. The keyring backend uses `keytar` following the same pattern as `auth0-mcp-server`
- R4. The `CredentialStore` public API remains unchanged — all consumers work without modification
- R5. Clear error message when keyring is unavailable and no fallback is configured
- R6. Existing file-based credentials continue to work when file backend is selected

## Scope Boundaries

- Do not change the PKCE flow, token exchange, or any command logic
- Do not implement automatic migration of existing file credentials to keyring
- Do not add encryption to the file-based backend
- Do not change the Auth0 config storage (`~/.auth0-tv/config.json`) — only credential/token storage

## Context & Research

### Relevant Code and Patterns

- `auth0-mcp-server/src/utils/keychain.ts` — `KeychainService` class wrapping `keytar` with service name `'auth0-mcp'`, storing individual items as separate keychain entries
- `auth0-mcp-server/test/utils/keychain.test.ts` — Mocks `keytar` with `vi.mock('keytar', ...)` for unit testing
- `auth0-token-vault-cli/src/store/credential-store.ts` — Current file-based `CredentialStore` with load/persist pattern
- `auth0-token-vault-cli/src/store/types.ts` — `Auth0Tokens`, `ConnectionToken`, `CredentialData` interfaces

### External References

- `keytar` (^7.9.0) — Native Node.js library for OS keychain access. Uses N-API prebuilds for macOS Keychain, Windows Credential Manager, and Linux libsecret/Secret Service.

## Key Technical Decisions

- **Use `keytar` ^7.9.0:** Same library and version as `auth0-mcp-server`. Proven, well-understood, native prebuilds avoid node-gyp compilation for most platforms.
- **Store as serialized JSON per credential type:** Unlike auth0-mcp-server which stores individual scalar values, our CLI needs to store structured data (connections map with nested tokens). Store `auth0` tokens as one JSON entry and each connection token as a separate entry. This keeps the keyring entries manageable while supporting the dynamic connections map.
- **Backend selection via config file and env var:** Add a `storage` field to `~/.auth0-tv/config.json` (or `AUTH0_TV_STORAGE` env var). Values: `keyring` (default) or `file`. This avoids adding global CLI flags that every command would need to handle.
- **Interface extraction:** Extract a `CredentialBackend` interface from the current `CredentialStore` class. Both `KeyringBackend` and `FileBackend` implement it. `CredentialStore` becomes a thin facade that delegates to the configured backend.
- **Keychain service name:** `auth0-tv` (distinct from `auth0-mcp`'s service name)

## Open Questions

### Resolved During Planning

- **How to handle the connections map in keyring?** Store each connection as a separate keychain entry (`auth0-tv / CONNECTION:<name>`) so they can be listed, added, and removed independently without loading all connections at once. The `listConnections` method will use `keytar.findCredentials` to enumerate.

### Deferred to Implementation

- **Exact `keytar.findCredentials` behavior across platforms:** May need implementation-time testing to confirm the prefix-filtering approach works consistently on all three platforms.
- **Whether `keytar` prebuilds cover the CI environment:** If CI lacks keychain access, tests may need to mock keytar or skip keyring-specific integration tests.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                    CredentialStore (facade)
                           │
              ┌────────────┴────────────┐
              │                         │
       KeyringBackend            FileBackend
       (keytar-based)         (current JSON file)
              │
              ▼
     OS Keyring entries:
     ┌─────────────────────────────────────┐
     │ service: "auth0-tv"                 │
     │                                     │
     │ account: "AUTH0_TOKENS"             │
     │   → JSON: {accessToken, refresh...} │
     │                                     │
     │ account: "CONNECTION:google-oauth2" │
     │   → JSON: {accessToken, expiresAt}  │
     │                                     │
     │ account: "CONNECTION:github"        │
     │   → JSON: {accessToken, expiresAt}  │
     └─────────────────────────────────────┘
```

## Implementation Units

- [ ] **Unit 1: Extract CredentialBackend interface and refactor FileBackend**

  **Goal:** Extract an interface from `CredentialStore`'s storage operations so both backends can share the same contract. Refactor existing file-based logic into a `FileBackend` class.

  **Requirements:** R4, R6

  **Dependencies:** None

  **Files:**
  - Create: `auth0-token-vault-cli/src/store/backend.ts`
  - Modify: `auth0-token-vault-cli/src/store/credential-store.ts`
  - Test: `auth0-token-vault-cli/test/store/credential-store.test.ts`

  **Approach:**
  - Define a `CredentialBackend` interface with methods matching the current store's data operations: `getAuth0Tokens`, `saveAuth0Tokens`, `getConnectionToken`, `saveConnectionToken`, `listConnections`, `removeConnection`, `clear`
  - Move the current file I/O logic from `CredentialStore` into a `FileBackend` class implementing this interface
  - `CredentialStore` becomes a facade that accepts a backend and delegates all operations
  - Default to `FileBackend` so existing behavior is unchanged — no consumers break

  **Patterns to follow:**
  - Current `CredentialStore` load/persist pattern

  **Test scenarios:**
  - All existing 15 credential store tests continue to pass without modification
  - `CredentialStore` constructed with `FileBackend` behaves identically to current implementation

  **Verification:**
  - All 57+ existing tests pass
  - No changes to any command files

- [ ] **Unit 2: Implement KeyringBackend using keytar**

  **Goal:** Create a `KeyringBackend` class that stores credentials in the OS keyring via `keytar`, following the auth0-mcp-server pattern.

  **Requirements:** R1, R3

  **Dependencies:** Unit 1

  **Files:**
  - Create: `auth0-token-vault-cli/src/store/keyring-backend.ts`
  - Modify: `auth0-token-vault-cli/package.json` (add `keytar` dependency)
  - Test: `auth0-token-vault-cli/test/store/keyring-backend.test.ts`

  **Approach:**
  - Add `keytar` ^7.9.0 as a dependency
  - `KeyringBackend` implements `CredentialBackend`
  - Service name: `auth0-tv`
  - Auth0 tokens stored under account `AUTH0_TOKENS` as JSON string
  - Connection tokens stored under account `CONNECTION:<name>` as JSON string
  - `listConnections` uses `keytar.findCredentials(serviceName)` and filters for `CONNECTION:` prefix
  - `clear` deletes all entries found via `findCredentials`
  - All keytar errors caught and logged, returning null/false as appropriate (same pattern as auth0-mcp-server)
  - Expiry checks remain in `CredentialStore` facade, not in the backend

  **Patterns to follow:**
  - `auth0-mcp-server/src/utils/keychain.ts` — KeychainService class structure, error handling
  - `auth0-mcp-server/test/utils/keychain.test.ts` — Mocking keytar with `vi.mock`

  **Test scenarios:**
  - Store and retrieve Auth0 tokens via mocked keytar
  - Store and retrieve connection tokens via mocked keytar
  - List connections returns only `CONNECTION:` prefixed entries
  - Remove connection deletes the correct keytar entry
  - Clear removes all entries
  - Keytar errors return null/false without throwing
  - Returns null when no credentials exist

  **Verification:**
  - All keyring backend tests pass with mocked keytar
  - Existing tests still pass (no changes to them)

- [ ] **Unit 3: Add backend selection via config and wire up CredentialStore**

  **Goal:** Allow users to choose between `keyring` and `file` storage backends via config, defaulting to `keyring`.

  **Requirements:** R2, R5

  **Dependencies:** Unit 1, Unit 2

  **Files:**
  - Modify: `auth0-token-vault-cli/src/utils/config.ts`
  - Modify: `auth0-token-vault-cli/src/store/credential-store.ts`
  - Test: `auth0-token-vault-cli/test/store/credential-store.test.ts`

  **Approach:**
  - Add `storage?: 'keyring' | 'file'` field to config interface and loading logic
  - Support `AUTH0_TV_STORAGE` env var (takes precedence over config file)
  - `CredentialStore` constructor: if no backend passed, detect from config — default `keyring`, fall back to `file` if specified
  - When `keyring` is selected but keytar fails to load or operate, throw a clear error: "OS keyring unavailable. Set AUTH0_TV_STORAGE=file to use file-based storage."
  - Keep the `dir` constructor parameter for file backend and tests

  **Patterns to follow:**
  - Current `loadConfig()` env-var-then-file precedence pattern
  - `CredentialStore` constructor pattern

  **Test scenarios:**
  - Default backend is keyring when config has no `storage` field
  - `AUTH0_TV_STORAGE=file` selects file backend
  - `storage: 'file'` in config.json selects file backend
  - Env var takes precedence over config file
  - Clear error when keyring is unavailable and keyring backend is selected
  - Invalid storage value produces helpful error

  **Verification:**
  - All existing tests pass (they use file backend via temp dir)
  - New config-driven tests pass
  - `auth0-tv login` + `auth0-tv status` works with keyring backend on macOS/Linux

- [ ] **Unit 4: Integration test and end-to-end verification**

  **Goal:** Add integration tests that verify the full credential lifecycle through both backends.

  **Requirements:** R1, R2, R4, R6

  **Dependencies:** Unit 3

  **Files:**
  - Modify: `auth0-token-vault-cli/test/integration/cli.test.ts`
  - Modify: `auth0-token-vault-cli/test/store/credential-store.test.ts`

  **Approach:**
  - Add a test suite for `CredentialStore` with `KeyringBackend` using mocked keytar
  - Verify the full lifecycle: save Auth0 tokens, save connection token, list connections, remove connection, clear — through the facade with keyring backend
  - Verify that the integration test's existing credential flow tests still pass with file backend

  **Test scenarios:**
  - Full credential lifecycle with keyring backend (mocked keytar)
  - Token exchange persists connection via keyring backend
  - Switching between backends via config

  **Verification:**
  - All tests pass
  - Manual verification: `AUTH0_TV_STORAGE=keyring auth0-tv login` stores tokens in OS keyring (visible in Keychain Access on macOS or `secret-tool` on Linux)

## System-Wide Impact

- **Interaction graph:** All 8 command files instantiate `CredentialStore` — the facade pattern ensures none need changes. `token-exchange.ts` imports `CredentialStore` as a type and is also unaffected.
- **Error propagation:** Keytar failures in `KeyringBackend` are caught and returned as null/false, matching the current file backend's behavior on missing/corrupt files. The facade preserves this contract.
- **State lifecycle risks:** No migration — users who switch from file to keyring start fresh. Old file credentials remain on disk but are ignored. Users can `auth0-tv logout` + `auth0-tv login` to re-populate keyring.
- **API surface parity:** `CredentialStore` public API is unchanged. No command changes needed.
- **Native dependency:** `keytar` adds a native dependency (prebuilt binaries). On most platforms this is transparent, but Linux may require `libsecret-1-dev` to be installed.

## Risks & Dependencies

- **Linux `libsecret` requirement:** `keytar` on Linux requires `libsecret-1-dev` and a running D-Bus session with Secret Service. Headless servers or minimal Docker images may lack this. Mitigated by the user-configurable file fallback.
- **Native prebuild availability:** `keytar` ships prebuilds for common platforms but may not cover all Node.js versions. If prebuilds are missing, `node-gyp` compilation is required. Mitigated by pinning to ^7.9.0 which has broad prebuild coverage.
- **CI environments:** CI runners may not have a keyring. Tests must mock keytar. Integration tests that test file backend are unaffected.

## Sources & References

- Related code: `auth0-mcp-server/src/utils/keychain.ts` (keytar pattern)
- Related code: `auth0-token-vault-cli/src/store/credential-store.ts` (current implementation)
- External docs: [keytar npm package](https://www.npmjs.com/package/keytar)
