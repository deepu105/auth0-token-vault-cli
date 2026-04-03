---
title: 'feat: Support custom/unknown service providers in connect, disconnect, and fetch'
type: feat
status: completed
date: 2026-04-03
---

# feat: Support custom/unknown service providers in connect, disconnect, and fetch

## Overview

Allow the CLI to accept arbitrary Auth0 connection names (e.g. `google-oauth2`, `sign-in-with-slack`, `my-custom-idp`) in the `connect`, `disconnect`, and `fetch` commands — not just the four hard-coded service names. Known services retain their current behavior (default scopes, default allowed domains). Unknown services are passed through to Auth0 directly, relying on user-supplied `--scopes` and `--allowed-domains`.

## Problem Frame

The Node.js CLI currently hard-codes four services in its registry (gmail, calendar, github, slack). Any other value causes an immediate error. However, Auth0 tenants can configure arbitrary social/enterprise connections. The Connected Accounts API and token exchange endpoints accept any valid connection string — the restriction is purely client-side. The Rust sibling (`tv-proxy`) already has a `Resolution::Unknown` variant in its registry that passes unknown inputs through, making it ready for this change.

## Requirements Trace

- R1. `auth0-tv connect <name>` must accept any string, not just known service names
- R2. Known services (gmail, calendar, github, slack) retain current behavior unchanged
- R3. For unknown services, the input string is used directly as the Auth0 connection name
- R4. Scopes for unknown services come entirely from `--scopes` (no defaults)
- R5. `auth0-tv disconnect <name>` must work for unknown services using the input as the connection name
- R6. `auth0-tv fetch <name> <url>` must work for unknown services, requiring stored or user-provided allowed domains
- R7. `auth0-tv connections` already displays unknown connections gracefully (uses `acct.connection` as fallback) — verify this still works

## Scope Boundaries

- Not adding a provider/service hierarchy to the Node.js registry (the Rust version's two-level `ProviderEntry > ServiceEntry` model is more complex than needed here)
- Not changing the Rust version — the user explicitly scoped this to Node.js
- Not adding a `--service` flag (Rust-only feature)
- Not changing how built-in service subcommands (gmail, calendar, slack, github subcommand groups) work — those still require their specific service clients

## Context & Research

### Relevant Code and Patterns

- **Service registry:** `src/utils/service-registry.ts` — flat `Record<string, ServiceEntry>` with `getServiceEntry()`, `getConnectionForService()`, `getAllowedDomainsForService()`
- **Connect command:** `src/commands/connect.ts` — rejects unknown at line 28, then uses `mapping.connection` and `mapping.scopes` throughout
- **Disconnect command:** `src/commands/disconnect.ts` — rejects unknown at line 20, uses `connection` for store operations
- **Fetch command:** `src/commands/fetch.ts` — rejects unknown at line 50, uses `connection` for token exchange and `getAllowedDomainsForService()` for domain defaults
- **Connections command:** `src/commands/connections.ts` — already handles unknown connections at line 69: `services.join(', ') || acct.connection`
- **Connected Accounts API:** `src/auth/connected-accounts.ts` — `runConnectedAccountFlow` accepts any `connection` string
- **Token exchange:** `src/auth/token-exchange.ts` — `exchangeForConnectionToken` accepts any `connection` string
- **Rust blueprint:** `token-vault-proxy/src/registry/mod.rs` — `resolve_any()` returns `Resolution::Unknown(String)` for unrecognized inputs

### Institutional Learnings

No `docs/solutions/` directory exists. No prior documented solutions for this area.

## Key Technical Decisions

- **Add `resolveService()` to the service registry** rather than modifying each command independently: A single resolution function returns either the known `ServiceEntry` or a minimal "custom" entry derived from the input. This mirrors the Rust `resolve_any` pattern and keeps commands simple. The function returns a consistent shape so callers don't need conditional logic.

- **Custom services use the input string as both the service key and the connection name:** When `getServiceEntry('my-custom-idp')` returns `undefined`, the resolution function returns `{ connection: input, scopes: [], allowedDomains: [] }`. This means no defaults — the user must supply scopes and domains via flags.

- **Service settings (allowed domains) are keyed by the lowercased input string:** For known services this is `gmail`, `slack`, etc. For custom services it's the raw connection name like `google-oauth2` or `my-custom-idp`. This reuses the existing `store.saveServiceSettings(key, ...)` and `store.getServiceSettings(key)` mechanism.

- **No validation of connection names client-side:** Auth0 server will reject invalid connections. The CLI should not second-guess what connections exist on a tenant.

## Open Questions

### Resolved During Planning

- **Should `--scopes` be required for unknown services?** No — some connections may not need scopes (like GitHub's fine-grained auth). The CLI already handles empty scopes correctly. The user can always add them.

- **Should `--allowed-domains` be required at connect time for unknown services?** No — it should be required at `fetch` time. The existing `fetch` command already errors with `no_allowed_domains` when no domains are configured. Connect can succeed without domains.

### Deferred to Implementation

- **Exact error message wording when fetch has no allowed domains** — the existing `no_allowed_domains` error is already clear; may just need the hint to reference the service name correctly for custom services.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

```
resolveService(input: string) → { connection, scopes, allowedDomains, isKnown }

Known service (e.g. "gmail"):
  → { connection: "google-oauth2", scopes: [...defaults], allowedDomains: [...defaults], isKnown: true }

Unknown service (e.g. "my-custom-idp"):
  → { connection: "my-custom-idp", scopes: [], allowedDomains: [], isKnown: false }

Commands use the returned object uniformly:
  connect:    connection + scopes (merged with --scopes flag)
  disconnect: connection
  fetch:      connection + allowedDomains (merged with stored settings)
```

## Implementation Units

- [ ] **Unit 1: Add resolution function to service registry**

**Goal:** Add a `resolveService()` function that returns a consistent shape for both known and unknown services, replacing scattered `getServiceEntry()` + rejection pattern.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**

- Modify: `src/utils/service-registry.ts`
- Test: `test/utils/service-registry.test.ts` (create if not exists, or add to existing)

**Approach:**

- Add a `ResolvedService` type with fields: `connection`, `scopes`, `allowedDomains`, `isKnown`
- Add `resolveService(input: string): ResolvedService` that checks the registry first, falls back to constructing a custom entry
- Keep all existing exports (`getServiceEntry`, `getConnectionForService`, etc.) unchanged for backward compatibility with service subcommands

**Patterns to follow:**

- Rust `resolve_any()` in `token-vault-proxy/src/registry/mod.rs`
- Existing `getServiceEntry()` pattern in `src/utils/service-registry.ts`

**Test scenarios:**

- Known service returns correct entry with `isKnown: true`
- Unknown service returns entry with input as connection, empty scopes/domains, `isKnown: false`
- Case-insensitive matching for known services still works
- All existing registry functions remain unchanged

**Verification:**

- All existing tests pass
- New resolution function handles both known and unknown inputs

---

- [ ] **Unit 2: Update connect command to accept custom services**

**Goal:** Remove the unknown-service rejection in `connect.ts` and use the new resolution function.

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 1

**Files:**

- Modify: `src/commands/connect.ts`
- Test: `test/commands/connect.test.ts`

**Approach:**

- Replace `getServiceEntry()` + rejection block with `resolveService()`
- Use the returned `connection` and `scopes` fields (scopes are empty for custom services, user-supplied `--scopes` are merged in)
- For `service` display name and settings key, use the lowercased input string
- The rest of the flow (Connected Accounts API, token exchange, domain saving) works as-is since it already accepts any connection string

**Patterns to follow:**

- Current connect flow structure (lines 39-148) — only the validation block at lines 28-37 changes
- Rust `connect.rs` lines 25-71 for how it uses the resolution result

**Test scenarios:**

- Known service (e.g. `gmail`) connects with defaults unchanged
- Unknown service (e.g. `my-custom-idp`) connects using input as connection name
- Unknown service with `--scopes` merges user scopes (no defaults)
- Unknown service with `--allowed-domains` saves settings
- Unknown service with `--scopes` and existing remote scopes merges correctly
- Progress message displays the custom service name

**Verification:**

- `auth0-tv connect gmail` works exactly as before
- `auth0-tv connect my-custom-idp --scopes read,write` reaches the Auth0 Connected Accounts API with `connection: "my-custom-idp"` and scopes `["read", "write"]`

---

- [ ] **Unit 3: Update disconnect command to accept custom services**

**Goal:** Remove the unknown-service rejection in `disconnect.ts` and use the resolution function.

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**

- Modify: `src/commands/disconnect.ts`
- Test: `test/commands/disconnect.test.ts` (create if needed)

**Approach:**

- Replace `getConnectionForService()` + rejection block with `resolveService()`
- Use the returned `connection` for store removal and remote account lookup
- For remote disconnect, match by `a.connection === resolved.connection`

**Patterns to follow:**

- Current disconnect flow — only the validation block at lines 17-29 changes

**Test scenarios:**

- Known service disconnects as before
- Unknown service disconnects using input as connection name
- Remote disconnect finds the right account by connection name
- Disconnecting an unknown service that was never connected shows "not_connected"

**Verification:**

- `auth0-tv disconnect gmail` works exactly as before
- `auth0-tv disconnect my-custom-idp` removes local token for that connection

---

- [ ] **Unit 4: Update fetch command to accept custom services**

**Goal:** Remove the unknown-service rejection in `fetch.ts` and use the resolution function. Handle allowed domains correctly for custom services.

**Requirements:** R6

**Dependencies:** Unit 1

**Files:**

- Modify: `src/commands/fetch.ts`
- Test: `test/commands/fetch.test.ts`

**Approach:**

- Replace `getConnectionForService()` + rejection block with `resolveService()`
- Use the returned `connection` for token exchange
- For allowed domains: merge `resolved.allowedDomains` (empty for custom) with stored settings. The existing `no_allowed_domains` error path already handles the case where no domains are configured
- Replace `getAllowedDomainsForService(serviceLower)` with `resolved.allowedDomains`

**Patterns to follow:**

- Current fetch domain validation flow (lines 76-105) — the merge logic stays, just the source of default domains changes

**Test scenarios:**

- Known service fetch works as before with default domains
- Unknown service with stored allowed domains from `connect --allowed-domains` works
- Unknown service with no stored domains returns `no_allowed_domains` error
- Domain validation (wildcard, exact match) works for custom service domains

**Verification:**

- `auth0-tv fetch gmail <url>` works exactly as before
- `auth0-tv fetch my-custom-idp https://api.example.com/data` works after `connect --allowed-domains api.example.com`
- `auth0-tv fetch my-custom-idp https://api.example.com/data` without allowed domains configured returns clear error

---

- [ ] **Unit 5: Verify connections command and update help text**

**Goal:** Confirm that `connections` command displays custom connections properly and update command descriptions/help to mention custom service support.

**Requirements:** R7

**Dependencies:** Units 2-4

**Files:**

- Modify: `src/commands/connect.ts` (description text)
- Modify: `src/commands/disconnect.ts` (description text)
- Modify: `src/commands/fetch.ts` (description text)
- Verify: `src/commands/connections.ts` (likely no changes needed)
- Test: `test/commands/connections.test.ts`

**Approach:**

- Update `.description()` strings to mention that custom Auth0 connection names are accepted
- Verify that `connections` command already shows custom connections by connection name (it does at line 69: `services.join(', ') || acct.connection`)
- Add a test case for connections listing a mix of known and custom services

**Test scenarios:**

- `connections` lists a custom connection with its raw connection name
- `connections` lists a mix of known and custom services
- Help text for `connect` mentions custom service support

**Verification:**

- `auth0-tv connect --help` shows updated description
- `auth0-tv connections` displays custom services by connection name

## System-Wide Impact

- **Interaction graph:** The service subcommand groups (gmail, calendar, slack, github) are unaffected — they use their own service client factories in `src/commands/service-helpers.ts` which are keyed by known service names. The change only affects the top-level `connect`, `disconnect`, and `fetch` commands.
- **Error propagation:** Errors from Auth0 for invalid connection names will propagate naturally through the existing `connect_failed` / `token_exchange_error` paths. No new error handling needed.
- **State lifecycle risks:** Custom service credentials and settings are stored using the same `CredentialStore` mechanisms. The service name key is the lowercased input string, which should be unique per connection name.
- **API surface parity:** The Rust version's `connect.rs` also needs the same change (removing its `Resolution::Unknown` rejection at lines 65-70), but that's out of scope per user request.
- **Integration coverage:** E2E tests should cover the full connect-then-fetch flow for a custom service, but this can be deferred since the Connected Accounts API and token exchange are already e2e-tested for known services.

## Risks & Dependencies

- **Auth0 server rejection:** If a user passes a connection name that doesn't exist on their tenant, Auth0 will reject the Connected Accounts API call. The existing error handling in `runConnectedAccountFlow` will surface this. No additional client-side validation needed.
- **Service settings key collision:** If a user connects both `gmail` (known) and `google-oauth2` (custom, same underlying connection), their settings are stored under different keys but share the same Auth0 connection. This is the same situation that already exists between `gmail` and `calendar` — both use `google-oauth2`. The scope merge logic already handles this correctly.

## Sources & References

- Rust registry: `token-vault-proxy/src/registry/mod.rs` — `resolve_any()`, `Resolution` enum
- Rust connect: `token-vault-proxy/src/commands/connect.rs` — lines 25-71 for resolution usage
- Node.js registry: `auth0-token-vault-cli/src/utils/service-registry.ts`
- Node.js connect: `auth0-token-vault-cli/src/commands/connect.ts`
- Node.js disconnect: `auth0-token-vault-cli/src/commands/disconnect.ts`
- Node.js fetch: `auth0-token-vault-cli/src/commands/fetch.ts`
- Connected Accounts API: `auth0-token-vault-cli/src/auth/connected-accounts.ts`
