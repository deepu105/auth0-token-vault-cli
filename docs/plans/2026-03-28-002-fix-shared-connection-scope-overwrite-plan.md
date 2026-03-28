---
title: 'fix: Merge scopes for services sharing an Auth0 connection'
status: active
type: fix
origin: User report — connecting Calendar after Gmail (or vice versa) loses scopes for the first service
---

# fix: Merge scopes for services sharing an Auth0 connection

## Problem

Gmail and Calendar both use the `google-oauth2` Auth0 connection. When a user runs `auth0-tv connect gmail` followed by `auth0-tv connect calendar`, the second connect call:

1. **Clears the local cached token** (`store.removeConnection(mapping.connection)` in `connect.ts:46`)
2. **Initiates the Connected Accounts flow with only Calendar scopes** (`mapping.scopes` = `['https://www.googleapis.com/auth/calendar']`)
3. The server-side connection is re-established with only Calendar scopes, losing Gmail scopes
4. Subsequent Gmail commands fail due to missing scopes

The root cause: `connect.ts` passes only the requesting service's scopes to `runConnectedAccountFlow`, but multiple services share the same Auth0 connection.

## Scope

**In scope:** Fix the connect flow to merge existing remote scopes with the new service's scopes when the connection is shared.

**Out of scope:** Changing storage keys from connection-based to service-based (unnecessary — one connection = one token with merged scopes is correct).

## Solution

When connecting a service, build the scope set as follows:

1. **Target service** (the one being connected): always include **all** scopes from the registry — the user is explicitly (re)authorizing this service
2. **Sibling services** (other services sharing the same connection that are already connected remotely): include only their **already-approved remote scopes** — preserve existing access without inflating consent

This means:

- `connect gmail` (first): sends Gmail's full registry scopes only
- `connect calendar` (Gmail already connected): sends Calendar's full registry scopes + Gmail's already-approved remote scopes
- `connect gmail` (Calendar already connected): sends Gmail's full registry scopes + Calendar's already-approved remote scopes
- `connect gmail` (Gmail already connected, re-connect): sends Gmail's full registry scopes (remote scopes are for the same service, registry is superset)

The `listConnectedAccounts` function already exists in `connected-accounts.ts` and returns scopes per connection.

## Implementation Units

### Unit 1: Merge existing remote scopes in connect command

- [ ] **Fetch existing remote scopes and merge with target service scopes**

**Files:**

- `src/commands/connect.ts`

**Approach:**

In `connect.ts`, after verifying the user is logged in and before calling `runConnectedAccountFlow`:

1. Import `listConnectedAccounts` from `../auth/connected-accounts.js`
2. Call `listConnectedAccounts(config, auth0Tokens.refreshToken)` to get current remote connections
3. Find the existing account matching `mapping.connection`
4. If found, merge its already-approved scopes with `mapping.scopes` (deduplicated)
5. Pass the merged scopes to `runConnectedAccountFlow`

```typescript
// Start with the full registry scopes for the target service
let scopes = [...mapping.scopes];

// Merge in already-approved remote scopes for sibling services on the same connection
try {
  const remoteAccounts = await listConnectedAccounts(config, auth0Tokens.refreshToken);
  const existing = remoteAccounts.find((a) => a.connection === mapping.connection);
  if (existing?.scopes.length) {
    scopes = [...new Set([...scopes, ...existing.scopes])];
  }
} catch {
  // Non-fatal — proceed with just the target service's scopes
}
```

Then pass `scopes` instead of `mapping.scopes` to `runConnectedAccountFlow`.

**Patterns to follow:** The `connections` command already calls `listConnectedAccounts` — same pattern.

**Test scenarios:**

- Connect first service on a connection: no existing remote account → sends only target service's registry scopes
- Connect second service on same connection: existing remote scopes found → sends target service's registry scopes + existing remote scopes (deduplicated)
- Re-connect same service: existing remote scopes are a subset of registry scopes → result is just registry scopes (no inflation)
- Remote API unreachable: falls back gracefully to just the target service's registry scopes

**Verification:** `npm run test` passes. Manual test: `auth0-tv connect gmail` then `auth0-tv connect calendar` — both services retain their scopes.
