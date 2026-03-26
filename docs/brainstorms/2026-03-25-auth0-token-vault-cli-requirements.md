---
date: 2026-03-25
topic: auth0-token-vault-cli
---

# Auth0 Token Vault CLI

## Problem Frame

Developers building AI agents (OpenClaw, Claude Code, etc.) need a way to let agents access third-party services (Gmail, Slack, Google Calendar) on behalf of authenticated users. Auth0 Token Vault provides the secure token exchange infrastructure, but there's no standalone CLI tool that bridges the gap between Token Vault and AI agent skill systems. Today, developers must build custom integrations from scratch.

The CLI (`auth0-tv`) serves two audiences: humans performing initial setup (login, connecting services) and AI agents invoking service commands programmatically.

**Why a CLI and not extend auth0-mcp-server?** The MCP server is for Auth0 Management API operations. This CLI is for user-facing services (Gmail, Slack, etc.) via Token Vault — a fundamentally different purpose. A CLI also works as a skill for any agent that can execute shell commands, not just MCP-capable agents.

## Requirements

### Authentication & Setup
- R1. Users authenticate by running `auth0-tv login` — CLI opens the default browser to Auth0's login page and receives the token via a temporary local HTTP callback server (Authorization Code + PKCE), same mechanism as the connect flow. The local callback server must validate the OAuth state parameter, bind to localhost only, and shut down after a short timeout.
- R2. Auth state (tokens, session) persists locally in `~/.auth0-tv/` with optional system keychain support via `--use-keychain`. Directory created with mode 0700, credential files with mode 0600. Tokens and credentials must never appear in CLI output, error messages, or debug logs.
- R3. Users connect third-party services by running `auth0-tv connect <service>` — CLI opens the default browser to an Auth0 authorization URL for the user to grant access (account linking flow)
- R4. Users can list connected services (`auth0-tv connections`) and disconnect them (`auth0-tv disconnect <service>`)
- R5. Users can check auth status (`auth0-tv status`) showing logged-in user and connected services (without exposing raw tokens)

### Token Flow
- R6. After login (R1), the CLI stores the Auth0 access token and refresh token locally
- R7. For each Gmail command, the CLI performs a token exchange using the stored Auth0 access token to obtain a Gmail access token via the federated-connection-access-token grant type (public client path, no client_secret required)
- R8. Gmail access tokens are cached locally with TTL based on expires_in. When expired, the CLI transparently re-exchanges. When re-exchange fails, the CLI exits with an auth-failure exit code indicating re-login or re-connect is needed

### Gmail Integration (v1 service)
Gmail commands are thin proxies to the [Gmail REST API](https://developers.google.com/workspace/gmail/api/reference/rest), either via direct HTTP calls or the [Google API Node.js client](https://github.com/googleapis/google-api-nodejs-client).

- R9. Search emails: `auth0-tv gmail search <query>` — supports Gmail search syntax, returns list of matching emails
- R10. Read email: `auth0-tv gmail read <message-id>` — displays full email content including headers, body, and attachment metadata
- R11. Send email: `auth0-tv gmail send --to <addr> --subject <subj> --body <body>` — compose and send a new email. Supports `--body-file <path>` or stdin as alternatives to `--body` flag (avoids exposing content in process list)
- R12. Reply to email: `auth0-tv gmail reply <message-id> --body <body>` — reply to an existing thread
- R13. Forward email: `auth0-tv gmail forward <message-id> --to <addr>` — forward an email
- R14. Draft management: `auth0-tv gmail draft create/list/send/delete` — create, list, send, and delete drafts
- R15. Label management: `auth0-tv gmail label <message-id> --add/--remove <label>` — add or remove labels from emails
- R16. Archive/delete: `auth0-tv gmail archive <message-id>`, `auth0-tv gmail delete <message-id>`

### Output & Agent Integration
- R17. Human-friendly formatted output by default; `--json` flag on all commands for structured JSON output suitable for agent consumption
- R18. Destructive/sensitive actions (send, delete, archive, forward) require `--confirm` or `--yes` flag when running non-interactively; prompt interactively when a TTY is detected
- R19. Consistent, non-zero exit codes for error categories so agents can handle errors programmatically: 1 = general error, 2 = invalid input/usage, 3 = authentication required (login needed), 4 = authorization required (connect needed), 5 = service API error, 6 = network error
- R20. A `--help` on every command with clear descriptions, usable as agent skill documentation

### Extensibility
- R21. Service commands are organized as subcommand groups (`auth0-tv gmail ...`, `auth0-tv calendar ...`, `auth0-tv slack ...`) so new services can be added without changing the core CLI structure

## Success Criteria

- A user can `auth0-tv login`, `auth0-tv connect gmail`, and then search/read/send emails entirely from the terminal
- An AI agent (OpenClaw, Claude Code) can invoke `auth0-tv gmail search "meeting notes" --json` and get structured results it can act on
- Adding a new service (e.g., Google Calendar) requires only adding a new subcommand group, not modifying auth or core infrastructure

## Scope Boundaries

- **In scope:** Auth0 login via browser (AuthZ Code + PKCE), connecting services via browser, Gmail full CRUD (thin proxy to Gmail API), JSON output mode, local credential persistence, token exchange and transparent refresh
- **Not in scope (v1):** Google Calendar, Slack, or other services beyond Gmail; MCP server mode; generic API escape hatch (R19 from prior version — deferred to v1.1); device flow / headless environment support (v1.1); multi-account/multi-tenant support; CI/CD pipeline integration
- **Not in scope (ever for CLI):** Implementing its own OAuth server or token storage — Auth0 Token Vault handles all token management

## Key Decisions

- **CLI name:** `auth0-tv` — short for Auth0 Token Vault
- **Language:** TypeScript/Node.js — reuses patterns from auth0-ai-js and auth0-mcp-server (Commander.js)
- **Primary audience:** Both humans and AI agents equally — human-friendly default output, `--json` for agents
- **Credential storage:** Local file (`~/.auth0-tv/`) by default, optional system keychain via `--use-keychain` flag
- **Auth flow:** Browser-open with local callback (Authorization Code + PKCE) for both login and connect — consistent UX. Device flow fallback deferred to v1.1 for headless environments
- **Safety model:** `--confirm`/`--yes` flag required for destructive actions in non-interactive mode; interactive prompt when TTY detected
- **Gmail scope:** Full CRUD in v1, implemented as thin proxy to Gmail REST API
- **Token exchange:** Uses access token exchange path (public client, no client_secret) to obtain federated connection tokens from Auth0 Token Vault
- **Why CLI, not MCP:** auth0-mcp-server handles Auth0 Management API; this CLI handles user-facing services via Token Vault — different purpose, broader agent compatibility

## Reuse Candidates

- **auth0-mcp-server KeychainService** (`src/utils/keychain.ts`) — keytar-based credential storage with token/refresh-token/domain/expiry. Can reuse for `--use-keychain` support
- **auth0-ai-js FederatedConnectionAuthorizerBase** (`packages/ai/src/authorizers/federated-connections/`) — canonical implementation of the token exchange grant type. Reference for token exchange parameters and scope validation
- **auth0-ai-js FSStore** (`packages/ai/src/stores/`) — filesystem persistence pattern with TTL support

## Dependencies / Assumptions

- Requires an Auth0 tenant with an application configured for Authorization Code + PKCE (Native type)
- Requires Auth0 Token Vault configured with Google (Gmail) as a federated connection
- Token Vault supports access token exchange for public clients (no client_secret required)
- Assumes `google-oauth2` connection name for Gmail (configurable)
- Gmail API scopes needed: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`

## Outstanding Questions

### Deferred to Planning
- [Affects R2][Technical] What encryption/protection approach for local credential file? Consider: OS keychain as default (like auth0-mcp-server) with encrypted file as fallback, or filesystem permissions only (like ~/.aws/credentials)
- [Affects R3][Needs research] What is the exact Auth0 account linking URL format for opening browser-based connection flow?
- [Affects R17][Technical] What JSON schema should structured output follow? (Consider compatibility with OpenClaw skill format)
- [Affects R1][Technical] What localhost port strategy for the callback server? Fixed well-known port or dynamic? Must align with Auth0 app callback URL configuration
- [Affects R9-R16][Technical] Direct Gmail REST API calls or use googleapis Node.js client library?

## Next Steps

→ `/ce:plan` for structured implementation planning
