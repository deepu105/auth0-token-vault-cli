---
title: 'refactor: Replace custom OAuth2 code with openid-client library'
type: refactor
status: active
date: 2026-03-26
---

# refactor: Replace custom OAuth2 code with openid-client

## Overview

Replace the hand-rolled OAuth2/OIDC fetch calls in `src/auth/` with the `openid-client` (v6.x) library by panva. This covers the PKCE authorization code flow, token refresh, and federated connection token exchange. The local HTTP callback server and browser orchestration stay as-is — the library doesn't cover those concerns.

## Problem Frame

The CLI currently has ~200 lines of custom OAuth2 code across three files (`pkce-flow.ts`, `token-refresh.ts`, `token-exchange.ts`) that manually construct `fetch()` calls to Auth0's `/oauth/token` and `/authorize` endpoints. This works, but:

- Edge cases around error responses, token type validation, and protocol compliance must be handled manually.
- Any new grant type (CIBA, device flow) requires writing another bespoke fetch wrapper.
- The `openid-client` library is the de facto standard for Node.js OIDC clients, battle-tested and maintained by the author of `jose`.

## Requirements Trace

- R1. Replace all direct `fetch()` calls to Auth0 `/oauth/token` and `/authorize` URL construction with `openid-client` equivalents
- R2. Preserve all existing behavior: PKCE login, connect (PKCE with connection params), token refresh, federated token exchange
- R3. Bump Node.js engine requirement from `>=18` to `>=20` (openid-client v6 requirement; Node 18 is already EOL)
- R4. Keep the local HTTP callback server, browser opening, and credential store unchanged
- R5. All existing tests must pass (updated to mock openid-client instead of raw fetch)

## Scope Boundaries

- **In scope:** `src/auth/pkce-flow.ts`, `src/auth/token-refresh.ts`, `src/auth/token-exchange.ts`, and a new shared configuration module
- **Out of scope:** Credential store, browser/server orchestration (`src/auth/browser.ts`), command layer, output utilities
- **Not changing:** The `open` package usage, the `bindServer` port-scanning logic, the HTML callback pages, the `CredentialStore` facade

## Context & Research

### Relevant Code and Patterns

- `src/auth/pkce-flow.ts` — PKCE verifier/challenge generation, `/authorize` URL construction, code-for-token exchange via `fetch()`. The callback server and browser opening are interleaved here.
- `src/auth/token-refresh.ts` — `refresh_token` grant via `fetch()` to `/oauth/token`
- `src/auth/token-exchange.ts` — Custom Auth0 federated connection token exchange grant via `fetch()`. Uses non-standard grant type `urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token`
- `src/auth/browser.ts` — HTTP callback server, port binding, HTML pages, browser logout. **Not touched by this refactor.**
- `src/store/credential-store.ts` — Calls `refreshAuth0Token()` from token-refresh. Interface stays the same.

### openid-client v6 API Mapping

| Current code                                                       | openid-client replacement                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Manual PKCE generation (`crypto.randomBytes`, `createHash`)        | `client.randomPKCECodeVerifier()`, `client.calculatePKCECodeChallenge()` |
| Manual `/authorize` URL construction                               | `client.buildAuthorizationUrl(config, params)`                           |
| `fetch('/oauth/token', { grant_type: 'authorization_code', ... })` | `client.authorizationCodeGrant(config, callbackUrl, checks)`             |
| `fetch('/oauth/token', { grant_type: 'refresh_token', ... })`      | `client.refreshTokenGrant(config, refreshToken)`                         |
| `fetch('/oauth/token', { grant_type: 'urn:auth0:...', ... })`      | `client.genericGrantRequest(config, grantType, params)`                  |
| Manual `state` generation                                          | `client.randomState()`                                                   |

### Key Library Details

- **Node.js requirement:** v20.x+ (v6.x)
- **ESM:** Pure ESM, compatible with project's `"type": "module"`
- **Configuration:** `new client.Configuration(serverMetadata, clientId, clientSecret)` for manual setup, or `client.discovery(serverUrl, clientId, clientSecret)` for auto-discovery
- **Insecure requests:** `client.allowInsecureRequests(config)` needed because the callback URI is `http://127.0.0.1:*` (non-HTTPS). This is standard for native CLI apps.
- **Custom grants:** `client.genericGrantRequest(config, grantType, params)` supports arbitrary grant types — perfect for the Auth0 federated connection token exchange
- **TokenEndpointResponse:** Has `access_token`, `token_type` (required), plus optional `refresh_token`, `id_token`, `expires_in`, `scope`

## Key Technical Decisions

- **Use discovery vs manual Configuration:** Use `client.discovery()` with the Auth0 domain. Auth0 supports `/.well-known/openid-configuration`. This eliminates hardcoding endpoint URLs and is more robust to Auth0 environment differences. Cache the Configuration instance per domain to avoid repeated discovery calls.
- **allowInsecureRequests:** Required because the local callback server uses `http://127.0.0.1`. This is explicitly designed for native apps and local dev — not a security concern.
- **Separate configuration factory:** Create a shared `src/auth/oidc-config.ts` module that builds and caches the `openid-client.Configuration` instance. All three auth modules will import from it.
- **Keep browser/server code untouched:** `openid-client` doesn't provide HTTP server or browser-opening capabilities. The `src/auth/browser.ts` module stays exactly as-is.
- **authorizationCodeGrant callback URL:** The library's `authorizationCodeGrant()` expects the full callback URL. Since the local HTTP server already receives the full URL with query params, we construct a `URL` object from it and pass it directly.

## Open Questions

### Resolved During Planning

- **Does openid-client support Auth0's custom token exchange grant type?** Yes — `genericGrantRequest()` accepts any arbitrary `grant_type` string and additional parameters.
- **Can we pass Auth0-specific params (connection, connection_scope, access_type) to the authorize URL?** Yes — `buildAuthorizationUrl()` accepts `Record<string, string>` and passes all params through.
- **Does the library handle http:// callback URIs?** Yes — via `allowInsecureRequests(config)`.

### Deferred to Implementation

- **Discovery caching strategy:** Whether to cache in-memory per process or per-call. Start with per-call (CLI is short-lived), optimize later if needed.
- **Error message parity:** The current code has specific error messages for `invalid_grant`, `expired_token`, `unauthorized_client`, etc. Need to verify openid-client's error types preserve the Auth0 error codes so the existing error handling in `token-exchange.ts` still works correctly.

## Implementation Units

- [ ] **Unit 1: Add openid-client dependency and bump Node.js requirement**

  **Goal:** Install `openid-client` v6.x and update the Node.js engine constraint.

  **Requirements:** R3

  **Dependencies:** None

  **Files:**
  - Modify: `package.json` (add dependency, bump engines)

  **Approach:**
  - Add `openid-client` to dependencies
  - Change `engines.node` from `>=18.0.0` to `>=20.0.0`
  - Update README Installation section to say Node.js 20+

  **Verification:**
  - `npm install` succeeds
  - `npm run typecheck` passes

- [ ] **Unit 2: Create shared OIDC configuration factory**

  **Goal:** Create a module that builds an `openid-client.Configuration` from `Auth0Config`, using discovery.

  **Requirements:** R1, R2

  **Dependencies:** Unit 1

  **Files:**
  - Create: `src/auth/oidc-config.ts`
  - Test: `test/auth/oidc-config.test.ts`

  **Approach:**
  - Export an `async function getOidcConfig(config: Auth0Config): Promise<Configuration>` that calls `client.discovery(new URL(\`https://\${config.domain}\`), config.clientId, config.clientSecret)`and then calls`client.allowInsecureRequests(config)`on the result (needed for`http://127.0.0.1` callback URIs)
  - Optionally cache by domain for the process lifetime (CLI is short-lived, so a simple module-level Map suffices)

  **Patterns to follow:**
  - Same import/export style as existing `src/auth/` modules
  - Same `log()` usage from `src/utils/logger.js`

  **Test scenarios:**
  - Discovery is called with the correct issuer URL
  - Configuration is returned with correct client ID
  - `allowInsecureRequests` is called on the config

  **Verification:**
  - Unit tests pass
  - `npm run typecheck` passes

- [ ] **Unit 3: Rewrite pkce-flow.ts to use openid-client**

  **Goal:** Replace manual PKCE generation, `/authorize` URL building, and authorization code exchange with openid-client functions. Keep the HTTP callback server and browser orchestration unchanged.

  **Requirements:** R1, R2, R4

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/auth/pkce-flow.ts`
  - Modify: `test/auth/pkce-flow.test.ts`

  **Approach:**
  - Replace `generatePkce()` with `client.randomPKCECodeVerifier()` + `client.calculatePKCECodeChallenge()`
  - Replace manual state generation with `client.randomState()`
  - Replace manual `/authorize` URL construction with `client.buildAuthorizationUrl(config, params)`, passing `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method`, `state`, `audience`, `connection`, `connection_scope`, and `access_type`/`prompt` as a flat params object
  - Replace `exchangeCode()` fetch call with `client.authorizationCodeGrant(config, callbackUrl, { pkceCodeVerifier, expectedState })`. Construct the callback URL as `new URL(req.url, \`http://127.0.0.1:\${port}\`)`
  - Map `TokenEndpointResponse` fields back to the existing `TokenResponse` interface shape for backward compatibility with callers (login.ts, connect.ts)
  - The `createServer()` callback, `bindServer()`, `open()`, timeout logic — all stay exactly as-is

  **Patterns to follow:**
  - `PkceFlowOptions` interface stays the same — callers don't change
  - `TokenResponse` return type stays the same

  **Test scenarios:**
  - Successful PKCE flow produces tokens
  - Auth0 error responses (error param in callback URL) are handled
  - State mismatch is rejected
  - Missing code is rejected
  - Timeout fires after 2 minutes

  **Verification:**
  - `npm run test -- test/auth/pkce-flow.test.ts` passes
  - `auth0-tv login` works end-to-end (manual)
  - `auth0-tv connect gmail` works end-to-end (manual)

- [ ] **Unit 4: Rewrite token-refresh.ts to use openid-client**

  **Goal:** Replace the manual `refresh_token` grant fetch with `client.refreshTokenGrant()`.

  **Requirements:** R1, R2

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/auth/token-refresh.ts`
  - Create: `test/auth/token-refresh.test.ts`

  **Approach:**
  - Get OIDC config via `getOidcConfig(config)`
  - Call `client.refreshTokenGrant(oidcConfig, refreshToken)`
  - Map the `TokenEndpointResponse` back to the `Auth0Tokens` shape (preserving the existing return type)
  - Keep the same fallback behavior: if no new `refresh_token` in response, keep the existing one

  **Patterns to follow:**
  - Same function signature `refreshAuth0Token(config, refreshToken): Promise<Auth0Tokens>`
  - Same error handling: throw on failure, caller catches

  **Test scenarios:**
  - Successful refresh returns new access token
  - Refresh with rotation returns new refresh token
  - Refresh without rotation preserves the original refresh token
  - Failed refresh throws with descriptive message

  **Verification:**
  - `npm run test -- test/auth/token-refresh.test.ts` passes

- [ ] **Unit 5: Rewrite token-exchange.ts to use openid-client**

  **Goal:** Replace the manual federated connection token exchange fetch with `client.genericGrantRequest()`.

  **Requirements:** R1, R2

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/auth/token-exchange.ts`
  - Modify: `test/auth/token-exchange.test.ts`

  **Approach:**
  - Get OIDC config via `getOidcConfig(config)`
  - Call `client.genericGrantRequest(oidcConfig, GRANT_TYPE, params)` where params include `subject_token_type`, `subject_token` (refresh token), `connection`, `requested_token_type`, and optionally `login_hint`
  - **Critical:** Preserve the existing error handling that maps Auth0-specific error codes (`unauthorized_client`, `access_denied`, `invalid_grant`, `expired_token`, `federated_connection_refresh_token_flow_failed`) to specific `TokenExchangeError` instances with correct exit codes. The library may throw its own error types — need to catch those and extract the Auth0 error code from the response body.
  - The cache-first check, scope validation, and `store.saveConnectionToken()` call stay exactly the same

  **Patterns to follow:**
  - Same function signature `exchangeForConnectionToken(config, store, connection, options?): Promise<string>`
  - Same `TokenExchangeError` class and exit code mapping

  **Test scenarios:**
  - Successful exchange returns and caches token
  - Cached token is returned without network call
  - `unauthorized_client` → EXIT_AUTHZ_REQUIRED
  - `invalid_grant` → EXIT_AUTH_REQUIRED
  - `federated_connection_refresh_token_flow_failed` → EXIT_AUTHZ_REQUIRED
  - Missing refresh token → EXIT_AUTH_REQUIRED
  - Insufficient scopes → EXIT_AUTHZ_REQUIRED

  **Verification:**
  - `npm run test -- test/auth/token-exchange.test.ts` passes
  - `auth0-tv gmail search "test"` works end-to-end (manual)

- [ ] **Unit 6: Remove dead code and run full test suite**

  **Goal:** Clean up any leftover manual crypto/fetch code and verify everything works together.

  **Requirements:** R5

  **Dependencies:** Units 3, 4, 5

  **Files:**
  - Modify: `src/auth/pkce-flow.ts` (remove unused imports: `createHash`, `randomBytes` from `node:crypto`)
  - Verify: all test files

  **Approach:**
  - Remove unused `node:crypto` imports from pkce-flow.ts (PKCE generation now handled by library)
  - Run `npm run build` and `npm run test` to confirm full suite passes
  - Run `npm run lint` to catch any issues

  **Verification:**
  - `npm run build` succeeds
  - `npm run test` — all 125+ tests pass
  - `npm run lint` — no errors

## System-Wide Impact

- **Interaction graph:** The credential store calls `refreshAuth0Token()` from `token-refresh.ts` — the function signature doesn't change, so no ripple effects. Commands call `exchangeForConnectionToken()` and `runPkceFlow()` — same signatures, same return types.
- **Error propagation:** Error types (`TokenExchangeError`) and exit codes are preserved. The library may wrap HTTP errors differently — Unit 5 must ensure Auth0 error codes are still extractable.
- **State lifecycle risks:** None — the library doesn't manage state/sessions. The credential store remains the single source of truth.
- **API surface parity:** No CLI interface changes. JSON output unchanged.

## Risks & Dependencies

- **openid-client error types:** The biggest risk is that `genericGrantRequest` and other library functions throw library-specific error types that may wrap or obscure Auth0's error codes (e.g., `error: "invalid_grant"`). The implementation must verify that Auth0 error codes are accessible from the library's error objects and update the catch blocks accordingly.
- **Discovery latency:** Each CLI invocation will now make an OIDC discovery call to `https://<domain>/.well-known/openid-configuration`. This adds a network round-trip (~50-200ms). For a CLI tool this is acceptable, but worth noting. Can be mitigated with file-based caching later if needed.
- **allowInsecureRequests caveat:** The `allowInsecureRequests` call is needed for `http://127.0.0.1` callback URIs. This is well-documented for native CLI apps and not a security concern, but should be commented in code.

## Sources & References

- openid-client v6.x: https://github.com/panva/openid-client
- API docs: https://github.com/panva/openid-client/blob/main/docs/README.md
- `genericGrantRequest`: https://github.com/panva/openid-client/blob/main/docs/functions/genericGrantRequest.md
- `refreshTokenGrant`: https://github.com/panva/openid-client/blob/main/docs/functions/refreshTokenGrant.md
- `authorizationCodeGrant`: https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md
- `Configuration` class: https://github.com/panva/openid-client/blob/main/docs/classes/Configuration.md
