---
title: 'feat: Auth0 Token Vault CLI (auth0-tv)'
type: feat
status: active
date: 2026-03-25
origin: docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md
---

# feat: Auth0 Token Vault CLI (auth0-tv)

## Overview

Build a TypeScript CLI tool (`auth0-tv`) that lets users authenticate via Auth0, connect third-party services (starting with Gmail), and interact with those services from the terminal. The CLI serves both humans and AI agents — human-friendly output by default, `--json` for structured agent consumption.

## Problem Frame

AI agents need to access third-party services on behalf of authenticated users. Auth0 Token Vault provides the token exchange infrastructure, but there's no CLI bridge between Token Vault and agent skill systems. This CLI fills that gap with a shell-executable tool any agent can invoke. (see origin: docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md)

## Requirements Trace

- R1. `auth0-tv login` via Authorization Code + PKCE with local callback server
- R2. Credential persistence in `~/.auth0-tv/` with filesystem permissions (0700/0600)
- R3. `auth0-tv connect <service>` opens browser for account linking
- R4. `auth0-tv connections` / `auth0-tv disconnect <service>`
- R5. `auth0-tv status` showing user and connected services
- R6-R8. Token flow: store Auth0 tokens, exchange for Gmail tokens, cache with TTL
- R9-R16. Gmail CRUD: search, read, send, reply, forward, drafts, labels, archive/delete
- R17. `--json` flag for structured output on all commands
- R18. `--confirm`/`--yes` for destructive actions in non-interactive mode
- R19. Exit codes: 1=general, 2=invalid input, 3=auth required, 4=authz required, 5=service error, 6=network error
- R20. `--help` on every command
- R21. Subcommand groups for extensibility

## Scope Boundaries

- **In scope:** Auth0 PKCE login, Gmail full CRUD via googleapis, token exchange, credential file storage, JSON output, exit codes
- **Not in scope (v1):** Keychain support, device flow / headless, generic API escape hatch, Calendar/Slack, MCP server mode, multi-account

## Context & Research

### Relevant Code and Patterns

- **auth0-mcp-server** (`/mnt/work/Workspace/okta/gen-ai/auth0-mcp-server/`) — Primary structural pattern to follow: Commander.js CLI, ESM, Vitest + MSW testing, debug-based stderr logger, package.json/tsconfig/eslint/prettier configs
- **auth0-mcp-server `device-auth-flow.ts`** — Token lifecycle patterns: refresh, expiry check with buffer, revocation, `getValidAccessToken()`
- **auth0-ai-js `FederatedConnectionAuthorizerBase`** — Token exchange grant type: `urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token`. Parameters: `subject_token`, `connection`, `requested_token_type`. For public client path, omit `client_secret` and use access token as `subject_token`
- **auth0-ai-js `FSStore`** — TTL-based filesystem persistence with debounced writes, absolute `expiresAt` timestamps
- **auth0-ai-js `login-helper`** — Local HTTP callback server with Express. For auth0-tv, use raw `http.createServer` with PKCE instead of express-openid-connect

### External References

- **Auth0 authorize endpoint for account linking:** `https://{domain}/authorize?connection=google-oauth2&connection_scope={scopes}&access_type=offline&prompt=consent&response_type=code&client_id={id}&redirect_uri={callback}&state={state}&code_challenge={challenge}&code_challenge_method=S256`
- **googleapis Node.js client:** Inject externally-obtained access token via `oauth2Client.setCredentials({ access_token })`. Use `google.gmail({ version: 'v1', auth: oauth2Client })`
- **Port strategy:** Fixed port with small fallback range (18484-18489). Register all as callback URLs in Auth0 app config. Bind to `127.0.0.1` only

## Key Technical Decisions

- **googleapis over raw HTTP:** Use `googleapis` npm package for Gmail. It handles RFC 2822 message formatting, pagination, and type safety. Inject Auth0-obtained access token via `setCredentials()`
- **Filesystem-only credentials (v1):** `~/.auth0-tv/credentials.json` with 0600 permissions. No keytar/native deps. Keychain deferred to v1.1
- **Fixed port with fallback range:** Try ports 18484-18489 for PKCE callback server. Register all in Auth0 app. Bind to 127.0.0.1 only
- **Token exchange via access token:** Public client path — exchange Auth0 access token (not refresh token) for federated connection access token. No client_secret needed
- **Debug output to stderr:** All logging via `debug('auth0-tv')` to stderr so `--json` stdout is never polluted
- **Shared output formatter:** Central `output(data, cmd)` function checks `--json` flag from root command and either prints JSON or human-friendly format

## Open Questions

### Resolved During Planning

- **Encryption approach for credential file?** → Filesystem permissions only (0600). No encryption in v1. Matches ~/.aws/credentials pattern. Simple, portable, no key management problem
- **Account linking URL format?** → `https://{domain}/authorize` with `connection=google-oauth2`, `connection_scope`, `access_type=offline`, `prompt=consent`, and PKCE params
- **Gmail API approach?** → `googleapis` npm package. Inject access token via `setCredentials()`. Provides typed methods for all Gmail operations
- **Localhost port strategy?** → Fixed range 18484-18489 with sequential fallback. Register all in Auth0 app callback URLs

### Deferred to Implementation

- **Exact JSON output shapes** — define per-command as each is implemented. Keep consistent top-level structure: `{ data, error, meta }` or similar
- **Gmail message body parsing** — multipart MIME handling details depend on what googleapis returns for various message types
- **Token exchange error codes** — exact Auth0 error responses for public client token exchange need runtime validation

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Entry (Commander.js)             │
│  auth0-tv [login|connect|status|connections|gmail ...]   │
│  Global flags: --json, --confirm/--yes                   │
└──────────┬──────────────────────────────────┬───────────┘
           │                                  │
    ┌──────▼──────┐                   ┌───────▼───────┐
    │  Auth Module │                   │ Service Layer │
    │  - PKCE flow │                   │ - Gmail       │
    │  - Token     │──── tokens ──────▶│   (googleapis)│
    │    exchange   │                   │ - (future:    │
    │  - Refresh    │                   │   Calendar,   │
    └──────┬───────┘                   │   Slack)      │
           │                           └───────────────┘
    ┌──────▼───────┐
    │ Credential   │
    │ Store        │
    │ ~/.auth0-tv/ │
    │ (JSON + TTL) │
    └──────────────┘
```

**Auth flow sequence:**

1. `login` → start localhost callback server → open browser to Auth0 `/authorize` with PKCE → receive code → exchange for tokens → store to `~/.auth0-tv/credentials.json`
2. `connect gmail` → same PKCE flow but with `connection=google-oauth2` and `connection_scope` for Gmail scopes → store updated tokens
3. `gmail search "query"` → load Auth0 access token → exchange for Gmail token via federated-connection grant → cache Gmail token with TTL → call Gmail API → format output

## Implementation Units

- [ ] **Unit 1: Project scaffolding and CLI skeleton**

  **Goal:** Set up the project structure, dependencies, build tooling, and a working CLI with `--help` that can be invoked as `auth0-tv`

  **Requirements:** R20, R21

  **Dependencies:** None

  **Files:**
  - Create: `auth0-token-vault-cli/package.json`
  - Create: `auth0-token-vault-cli/tsconfig.json`
  - Create: `auth0-token-vault-cli/tsconfig.test.json`
  - Create: `auth0-token-vault-cli/eslint.config.js`
  - Create: `auth0-token-vault-cli/.prettierrc`
  - Create: `auth0-token-vault-cli/vitest.config.ts`
  - Create: `auth0-token-vault-cli/src/index.ts`
  - Create: `auth0-token-vault-cli/src/utils/logger.ts`
  - Create: `auth0-token-vault-cli/src/utils/output.ts`
  - Create: `auth0-token-vault-cli/src/utils/exit-codes.ts`
  - Create: `auth0-token-vault-cli/src/utils/config.ts`

  **Approach:**
  - Copy scaffolding patterns from auth0-mcp-server: ESM, `"type": "module"`, `"bin": { "auth0-tv": "dist/index.ts" }`, same tsconfig/eslint/prettier settings
  - Commander.js top-level program with `--json` and `--confirm` global flags
  - Placeholder subcommand groups: `login`, `status`, `gmail` (empty for now)
  - `output.ts`: central formatter that checks `--json` flag from root command opts and renders JSON or human-friendly
  - `exit-codes.ts`: named constants for exit codes 1-6
  - `config.ts`: `Auth0Config` interface (domain, clientId, audience) loaded from `~/.auth0-tv/config.json` or env vars (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`)
  - `logger.ts`: `debug('auth0-tv')` to stderr

  **Patterns to follow:**
  - `auth0-mcp-server/src/index.ts` — Commander setup
  - `auth0-mcp-server/package.json` — scripts, bin, engines, type
  - `auth0-mcp-server/src/utils/logger.ts` — debug-based stderr logging

  **Test scenarios:**
  - CLI prints help text with all subcommand groups listed
  - `--version` prints package version
  - Unknown commands exit with code 2

  **Verification:**
  - `npx tsx src/index.ts --help` shows auth0-tv with login, status, gmail subcommands
  - Build succeeds with `npm run build`
  - Lint passes with `npm run lint`

- [ ] **Unit 2: Credential store and config management**

  **Goal:** Implement filesystem-based credential storage at `~/.auth0-tv/` with proper permissions and TTL-based caching

  **Requirements:** R2, R6, R8

  **Dependencies:** Unit 1

  **Files:**
  - Create: `auth0-token-vault-cli/src/store/credential-store.ts`
  - Create: `auth0-token-vault-cli/src/store/types.ts`
  - Create: `auth0-token-vault-cli/test/store/credential-store.test.ts`

  **Approach:**
  - `CredentialStore` class managing `~/.auth0-tv/credentials.json`
  - Directory created with mode 0700, file with 0600 on every write
  - Store structure: `{ auth0: { accessToken, refreshToken, expiresAt }, connections: { "google-oauth2": { accessToken, expiresAt, scopes } } }`
  - `getAuth0Token()` — returns access token or null if expired
  - `getConnectionToken(connection)` — returns cached federated token or null if expired
  - `saveAuth0Tokens(tokens)` / `saveConnectionToken(connection, token)` — write with TTL
  - `isExpired(expiresAt, bufferSeconds = 300)` — proactive expiry check with 5-min buffer (pattern from auth0-mcp-server's `isTokenExpired`)
  - `clear()` — remove credential file
  - Token values must never appear in debug logs or error messages

  **Patterns to follow:**
  - `auth0-ai-js FSStore` — JSON persistence with `expiresAt` timestamps
  - `auth0-mcp-server device-auth-flow.ts` — `isTokenExpired` with buffer

  **Test scenarios:**
  - Saves and retrieves Auth0 tokens
  - Saves and retrieves connection tokens
  - Returns null for expired tokens (including buffer window)
  - Creates directory with 0700 and file with 0600
  - `clear()` removes the credential file
  - Handles missing/corrupt credential file gracefully

  **Verification:**
  - All credential store tests pass
  - File permissions are correct on creation

- [ ] **Unit 3: PKCE auth flow (login and connect)**

  **Goal:** Implement Authorization Code + PKCE flow with local HTTP callback server, supporting both `login` and `connect` commands

  **Requirements:** R1, R3, R4, R5

  **Dependencies:** Unit 2

  **Files:**
  - Create: `auth0-token-vault-cli/src/auth/pkce-flow.ts`
  - Create: `auth0-token-vault-cli/src/auth/token-exchange.ts`
  - Create: `auth0-token-vault-cli/src/commands/login.ts`
  - Create: `auth0-token-vault-cli/src/commands/connect.ts`
  - Create: `auth0-token-vault-cli/src/commands/disconnect.ts`
  - Create: `auth0-token-vault-cli/src/commands/connections.ts`
  - Create: `auth0-token-vault-cli/src/commands/status.ts`
  - Modify: `auth0-token-vault-cli/src/index.ts` — wire up commands
  - Create: `auth0-token-vault-cli/test/auth/pkce-flow.test.ts`
  - Create: `auth0-token-vault-cli/test/commands/login.test.ts`
  - Create: `auth0-token-vault-cli/test/commands/status.test.ts`
  - Create: `auth0-token-vault-cli/test/setup.ts`
  - Create: `auth0-token-vault-cli/test/mocks/handlers.ts`

  **Approach:**
  - `pkce-flow.ts`: Core PKCE implementation reused by both login and connect
    - Generate `code_verifier` with `crypto.randomBytes(32).toString('base64url')`
    - Derive `code_challenge` via SHA-256
    - Generate random `state` parameter
    - Start `http.createServer` on 127.0.0.1, try ports 18484-18489 sequentially
    - Open browser via `open` package to Auth0 `/authorize` endpoint
    - Validate `state` on callback, reject mismatches
    - Exchange code for tokens at `/oauth/token` with `code_verifier`
    - 2-minute timeout, single-use, reject non-`/callback` paths
    - Return HTML page that auto-closes on successful callback
  - `login` command: Calls PKCE flow without `connection` param (standard Auth0 login). Stores Auth0 tokens via credential store
  - `connect` command: Calls PKCE flow with `connection=google-oauth2`, `connection_scope` for Gmail scopes, `access_type=offline`, `prompt=consent`. Stores/updates Auth0 tokens
  - `disconnect` command: Removes connection entry from credential store
  - `connections` command: Lists stored connections with their scope and expiry status
  - `status` command: Shows logged-in user (decode JWT for email/name), lists connected services. Never shows raw tokens
  - `token-exchange.ts`: Federated connection token exchange
    - POST to `/oauth/token` with grant_type `urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token`
    - `subject_token_type`: `urn:ietf:params:oauth:token-type:access_token`
    - `subject_token`: Auth0 access token
    - `connection`: e.g., `google-oauth2`
    - `requested_token_type`: `http://auth0.com/oauth/token-type/federated-connection-access-token`
    - No `client_secret` (public client)
    - Cache result in credential store with TTL from `expires_in`
    - On failure, exit with code 3 (auth required) or 4 (authz required) depending on error

  **Patterns to follow:**
  - `auth0-ai-js login-helper` — local callback server pattern
  - `auth0-ai-js FederatedConnectionAuthorizerBase` — token exchange params
  - `auth0-mcp-server device-auth-flow.ts` — token lifecycle, open browser

  **Test scenarios:**
  - PKCE flow generates valid code_verifier and code_challenge
  - Callback server validates state parameter, rejects mismatches
  - Callback server times out after configured duration
  - Callback server binds to 127.0.0.1 only
  - Token exchange returns Gmail access token and stores with TTL
  - Token exchange handles errors with correct exit codes
  - `status` command shows user info without exposing tokens
  - `connections` lists connected services
  - Login when already logged in refreshes tokens

  **Verification:**
  - Auth flow tests pass with mocked Auth0 endpoints (MSW)
  - `auth0-tv login` opens browser and completes auth cycle
  - `auth0-tv status` shows logged-in user

- [ ] **Unit 4: Gmail service layer**

  **Goal:** Implement the Gmail API client wrapper using `googleapis`, with token injection from the credential store

  **Requirements:** R7, R9-R16

  **Dependencies:** Unit 2, Unit 3

  **Files:**
  - Create: `auth0-token-vault-cli/src/services/gmail/client.ts`
  - Create: `auth0-token-vault-cli/src/services/gmail/types.ts`
  - Create: `auth0-token-vault-cli/src/services/gmail/formatters.ts`
  - Create: `auth0-token-vault-cli/test/services/gmail/client.test.ts`
  - Create: `auth0-token-vault-cli/test/mocks/gmail/handlers.ts`
  - Create: `auth0-token-vault-cli/test/mocks/gmail/data.ts`

  **Approach:**
  - `client.ts`: `GmailClient` class wrapping `googleapis`
    - Constructor takes an access token getter function (async, handles refresh transparently)
    - Creates `OAuth2` client and calls `setCredentials({ access_token })` before each operation
    - Methods map 1:1 to Gmail API:
      - `search(query, maxResults?, pageToken?)` → `messages.list` + batch `messages.get` for snippets
      - `read(messageId)` → `messages.get` with `format: 'full'`
      - `send(to, subject, body)` → `messages.send` with RFC 2822 raw message
      - `reply(messageId, body)` → read original for threadId + headers, then `messages.send` with `In-Reply-To` and `References` headers
      - `forward(messageId, to)` → read original, rebuild with `Fwd:` subject, `messages.send`
      - `createDraft(to, subject, body)`, `listDrafts()`, `sendDraft(draftId)`, `deleteDraft(draftId)`
      - `modifyLabels(messageId, addLabelIds, removeLabelIds)` → `messages.modify`
      - `archive(messageId)` → `messages.modify` removing `INBOX` label
      - `deleteMessage(messageId)` → `messages.trash`
    - All methods return typed response objects (defined in `types.ts`)
    - Pagination for list operations returns `{ messages, nextPageToken }`
  - `types.ts`: Response types for each operation (EmailSummary, EmailFull, DraftSummary, etc.)
  - `formatters.ts`: Human-friendly formatting for each response type (table for search results, formatted email for read, etc.)

  **Patterns to follow:**
  - `googleapis` docs for Gmail v1 API methods
  - `auth0-assistant0/ts-vercel-ai/src/lib/tools/gmail.ts` — Gmail tool patterns

  **Test scenarios:**
  - Search returns paginated message list
  - Read returns full email with headers, body, attachment metadata
  - Send constructs valid RFC 2822 message
  - Reply preserves thread context (threadId, In-Reply-To, References)
  - Forward rebuilds message with Fwd: prefix
  - Draft CRUD operations work correctly
  - Label add/remove calls modify with correct label IDs
  - Archive removes INBOX label
  - Delete moves to trash
  - Handles Gmail API errors (404, 401, 429) with appropriate exit codes
  - Token getter is called before each operation (supports transparent refresh)

  **Verification:**
  - Gmail client tests pass with MSW-mocked Gmail API endpoints
  - All response types are well-defined and used consistently

- [ ] **Unit 5: Gmail CLI commands**

  **Goal:** Wire Gmail service layer to Commander.js subcommands with output formatting, confirmation prompts, and exit code handling

  **Requirements:** R9-R20

  **Dependencies:** Unit 4, Unit 3

  **Files:**
  - Create: `auth0-token-vault-cli/src/commands/gmail/index.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/search.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/read.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/send.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/reply.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/forward.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/draft.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/label.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/archive.ts`
  - Create: `auth0-token-vault-cli/src/commands/gmail/delete.ts`
  - Modify: `auth0-token-vault-cli/src/index.ts` — register gmail command group
  - Create: `auth0-token-vault-cli/test/commands/gmail/search.test.ts`
  - Create: `auth0-token-vault-cli/test/commands/gmail/send.test.ts`
  - Create: `auth0-token-vault-cli/test/commands/gmail/read.test.ts`

  **Approach:**
  - `gmail/index.ts`: Commander command group `new Command('gmail')` with subcommands
  - Each command handler:
    1. Loads Auth0 token from credential store (exit code 3 if missing/expired)
    2. Exchanges for Gmail token via token-exchange (exit code 4 if connection missing)
    3. Creates GmailClient with token getter
    4. Calls the appropriate GmailClient method
    5. Formats output via `output.ts` (JSON or human-friendly based on `--json`)
    6. For destructive actions (send, delete, archive, forward): check TTY and `--confirm` flag
  - `send.ts`: Support `--body`, `--body-file`, and stdin for body content. When no body source provided and TTY detected, prompt interactively. When no body source and no TTY, exit with code 2
  - `reply.ts` / `forward.ts`: Same body input options as send
  - `search.ts`: `--max-results` option (default 10), `--page-token` for pagination
  - `draft.ts`: Subcommands `create`, `list`, `send`, `delete` under `auth0-tv gmail draft`
  - Confirmation for destructive actions: If TTY detected and `--confirm`/`--yes` not set, prompt with readline. If no TTY and no `--confirm`, exit with code 2 and message explaining the flag is required

  **Patterns to follow:**
  - `auth0-mcp-server/src/commands/` — command handler pattern
  - `auth0-mcp-server/src/utils/terminal.ts` — interactive prompts

  **Test scenarios:**
  - `gmail search "test"` returns formatted email list
  - `gmail search "test" --json` returns JSON array
  - `gmail send` without `--confirm` in non-TTY exits with code 2
  - `gmail send --to x --subject y --body z --confirm` succeeds
  - `gmail send --body-file /path` reads body from file
  - `gmail read <id>` displays formatted email
  - `gmail delete <id>` prompts for confirmation when TTY
  - Exit code 3 when not logged in
  - Exit code 4 when Gmail not connected
  - Exit code 5 when Gmail API returns an error

  **Verification:**
  - All Gmail command tests pass
  - Help text for each command includes usage examples
  - `--json` output is valid JSON parseable by agents

- [ ] **Unit 6: Integration testing and polish**

  **Goal:** End-to-end integration tests for the full CLI flow, error handling polish, and README

  **Requirements:** All — validation of success criteria

  **Dependencies:** Units 1-5

  **Files:**
  - Create: `auth0-token-vault-cli/test/integration/cli.test.ts`
  - Create: `auth0-token-vault-cli/README.md`
  - Modify: `auth0-token-vault-cli/src/index.ts` — final wiring, error handlers

  **Approach:**
  - Integration tests verify the full flow with MSW-mocked endpoints:
    1. Login → status shows user → connect gmail → gmail search returns results
    2. Gmail command when not logged in → exit code 3
    3. Gmail command when not connected → exit code 4
    4. Gmail API error → exit code 5
    5. Invalid command → exit code 2
  - Global error handlers for uncaught exceptions and unhandled rejections (pattern from auth0-mcp-server)
  - README with: quick start (login, connect, search), command reference, agent integration guide (how to use as OpenClaw/Claude Code skill), environment variables, Auth0 tenant setup guide

  **Patterns to follow:**
  - `auth0-mcp-server/test/integration/mcp-server.test.ts`

  **Test scenarios:**
  - Full login → connect → search → read → send flow
  - Error cascades produce correct exit codes
  - `--json` output across all commands is valid JSON
  - Concurrent CLI invocations don't corrupt credential file

  **Verification:**
  - All tests pass (unit + integration)
  - `npm run build` succeeds
  - `npm run lint` passes
  - CLI is usable end-to-end with a real Auth0 tenant

## System-Wide Impact

- **No existing code modified** — this is a new standalone project in `auth0-token-vault-cli/`
- **Error propagation:** All errors funnel through `exit-codes.ts` constants. Gmail API errors map to exit code 5, auth errors to 3/4, input errors to 2
- **State lifecycle:** Credential file is the single source of truth. No in-memory state persists between CLI invocations. TTL-based expiry with 5-minute buffer prevents stale token usage
- **API surface parity:** Each Gmail command supports both `--json` and human output. All destructive commands enforce the same `--confirm` model

## Risks & Dependencies

- **Auth0 Token Vault public client support** — The plan assumes access token exchange works for public clients (no client_secret). If this doesn't work, the architecture needs a confidential client with a locally-stored secret. Mitigation: Validate this in Unit 3 before building the Gmail layer
- **Auth0 callback URL registration** — Must pre-register `http://127.0.0.1:18484/callback` through `:18489/callback` in the Auth0 app. _Mitigation:_ Document in README setup guide
- **googleapis dependency size** — The full `googleapis` package is large. Consider using `@googleapis/gmail` (scoped package) if available, which is much smaller
- **Gmail API rate limits** — Agents calling search + read in loops may hit per-user quotas. _Mitigation:_ Return rate limit errors with exit code 5 and include retry-after info in JSON output

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md](../brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md)
- auth0-mcp-server: `/mnt/work/Workspace/okta/gen-ai/auth0-mcp-server/` — CLI structure, Commander.js, testing patterns
- auth0-ai-js FederatedConnectionAuthorizerBase: `packages/ai/src/authorizers/federated-connections/` — token exchange grant type
- auth0-ai-js FSStore: `packages/ai/src/stores/impl/FSStore.ts` — TTL persistence pattern
- auth0-ai-js login-helper: `tools/login-helper/lib/index.js` — local callback server
- Gmail API reference: https://developers.google.com/workspace/gmail/api/reference/rest
- googleapis Node.js client: https://github.com/googleapis/google-api-nodejs-client
