---
title: "feat: Add Google Calendar and Slack services"
type: feat
status: active
date: 2026-03-28
origin: docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md
---

# feat: Add Google Calendar and Slack services

## Overview

Add two new service integrations — Google Calendar and Slack — following the established Gmail pattern. Each service gets a thin client layer over its respective SDK, a command group with common operations, formatters for human output, MSW mocks, and tests. The service registry is updated to support multiple services sharing a single Auth0 connection (Google Calendar + Gmail both use `google-oauth2`).

## Problem Frame

The CLI currently only supports Gmail. The brainstorm doc (R21) designed the subcommand pattern specifically for extensibility: `auth0-tv calendar ...`, `auth0-tv slack ...`. Users and agents need access to calendar events and Slack messaging to build useful automation workflows. (see origin: docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md)

## Requirements Trace

- R21. Service commands organized as subcommand groups for easy extension
- R17. Human-friendly + JSON output for all new commands
- R18. Destructive actions require `--confirm`/`--yes` in non-interactive mode
- R19. Consistent exit codes across all services
- R3/R4. Connect/disconnect must work for new services

## Scope Boundaries

- **In scope:** Google Calendar (list calendars, list/get/create/update/delete events, quick-add) and Slack (list channels, list/search messages, post message, reply to thread, react, list users, set status)
- **Not in scope:** File uploads, Slack app management, calendar sharing/ACL, recurring event management, Slack slash commands, webhook integrations
- **Not in scope:** Changing auth infrastructure — token exchange and connected accounts flows work as-is

## Context & Research

### Relevant Code and Patterns

- **Gmail service pattern:** `src/services/gmail/client.ts` (class with `TokenGetter`, private api accessor, methods returning typed results), `types.ts` (interfaces), `formatters.ts` (chalk-based human output)
- **Gmail commands pattern:** `src/commands/gmail/index.ts` (creates Command, registers sub-commands), `helpers.ts` (shared `createXClient`, `handleXError`, `requireConfirmation`, `resolveBody`)
- **Service registry:** `src/utils/service-registry.ts` — lookup by service name, reverse lookup by connection name
- **Entry point:** `src/index.ts` — `program.addCommand(createXCommand())`
- **Test mocks:** `test/mocks/gmail/handlers.ts` + `data.ts`, `test/mocks/handlers.ts` (Auth0 handlers)
- **Test pattern:** `test/services/gmail/client.test.ts` — MSW server with service-specific handlers

### External Dependencies

- **Google Calendar:** Already available via `googleapis` (v144+ is a dependency). Uses `google.calendar('v3')` with the same `OAuth2Client` pattern as Gmail.
- **Slack:** Requires new dependency `@slack/web-api`. The `WebClient` class accepts a token string directly — no OAuth client setup needed. Works with user tokens from Auth0 federated connection exchange.

## Key Technical Decisions

- **Service registry 1:N mapping:** Google Calendar and Gmail share the `google-oauth2` Auth0 connection. The `CONNECTION_TO_SERVICE` reverse map must become `Map<string, string[]>` (one connection → multiple service names). The `getServiceForConnection()` function returns the first match but `getServicesForConnection()` (new, plural) returns all. The `connections` command uses the plural form to display all services for a connection.
- **Google Calendar scopes:** `https://www.googleapis.com/auth/calendar` (full read/write) — a single scope covers list, create, update, delete. These are *additional* scopes on the same `google-oauth2` connection, so connecting calendar may prompt the user to re-authorize with broader Google scopes.
- **Slack connection name:** `sign-in-with-slack` — this is the Auth0 social connection identifier for Slack (per Auth0 for AI Agents docs). Not `slack`.
- **Slack scopes:** `channels:read`, `channels:history`, `groups:read`, `groups:history`, `chat:write`, `search:read`, `reactions:write`, `users:read`, `users.profile:write` — covers the planned command surface. `search:read` is user-token-only (not available with bot tokens), which aligns with the Auth0 Token Vault approach.
- **Slack WebClient per-call pattern:** Unlike Gmail's `OAuth2Client.setCredentials()`, `WebClient` takes the token at construction. Create a new `WebClient(await this.getToken())` per method call (constructor is lightweight) to handle token refresh transparently.
- **Shared helpers:** `requireConfirmation` and `resolveBody` in `src/commands/gmail/helpers.ts` are useful for all services. Extract them to a shared location (`src/commands/shared-helpers.ts`) so calendar and slack commands can reuse without importing from gmail.
- **Error handler per service:** Each service gets its own `handleXError()` because error shapes differ (googleapis errors vs Slack's `WebAPICallResult` with `error` string).

## Open Questions

### Resolved During Planning

- **Q: Can the same Auth0 connection support different scope sets for different services?** Yes — Auth0's Connected Accounts API handles scope expansion. When a user runs `auth0-tv connect calendar` after already connecting Gmail, the connect flow requests the additional calendar scopes. The token exchange returns tokens with the union of granted scopes.
- **Q: Does @slack/web-api work with user tokens from Auth0?** Yes — `new WebClient(token)` accepts any valid Slack user OAuth token regardless of how it was obtained.

### Deferred to Implementation

- **Whether `google-oauth2` scope expansion requires re-consent or is automatic** — depends on Auth0 tenant configuration

### Resolved by External Research

- **Slack API error codes for exit code mapping:** `not_authed`/`invalid_auth`/`token_expired`/`token_revoked` → EXIT_AUTH_REQUIRED, `missing_scope` → EXIT_AUTHZ_REQUIRED, `channel_not_found`/`not_in_channel` → EXIT_INVALID_INPUT, rate limiting handled automatically by `@slack/web-api` (retries with `Retry-After`)
- **Slack rate limit handling:** `WebClient` handles 429 retries automatically by default — no custom retry logic needed
- **Google Calendar `calendarId`:** Uses `'primary'` (like Gmail's `userId: 'me'`). `events.list` with `singleEvents: true, orderBy: 'startTime'` is the standard pattern for upcoming events
- **Google Calendar `patch` vs `update`:** Use `events.patch` for partial updates (preferred for CLI), `events.update` requires full body

## Implementation Units

- [ ] **Unit 1: Extract shared command helpers**

  **Goal:** Move `requireConfirmation` and `resolveBody` from `src/commands/gmail/helpers.ts` to a shared location so all services can use them.

  **Requirements:** R18 (destructive action safety across all services)

  **Dependencies:** None

  **Files:**
  - Create: `src/commands/shared-helpers.ts`
  - Modify: `src/commands/gmail/helpers.ts` (re-export from shared)
  - Test: `test/commands/shared-helpers.test.ts`

  **Approach:**
  - Move `requireConfirmation`, `resolveBody`, and the `isConfirmed` helper to `src/commands/shared-helpers.ts`
  - Have `src/commands/gmail/helpers.ts` re-export them so existing gmail command imports remain unchanged
  - Existing tests in `test/commands/gmail/helpers.test.ts` should keep passing (they import from `./helpers.js`)

  **Patterns to follow:**
  - `src/commands/gmail/helpers.ts` for the current shape

  **Test scenarios:**
  - Existing gmail helpers tests still pass
  - New shared-helpers tests for `requireConfirmation` and `resolveBody` (move/duplicate from gmail tests)

  **Verification:**
  - All existing tests pass, no import changes needed in gmail commands

- [ ] **Unit 2: Update service registry for multi-service connections**

  **Goal:** Support multiple services sharing one Auth0 connection (google-oauth2 → gmail + calendar).

  **Requirements:** R3, R4, R21

  **Dependencies:** None

  **Files:**
  - Modify: `src/utils/service-registry.ts`
  - Modify: `src/commands/connections.ts` (use plural lookup)
  - Modify: `test/utils/service-registry.test.ts`

  **Approach:**
  - Add `calendar` and `slack` entries to `SERVICE_REGISTRY`
  - Change `CONNECTION_TO_SERVICE` from `Map<string, string>` to `Map<string, string[]>`
  - Add `getServicesForConnection(connection): string[]` (returns all services for a connection)
  - Keep `getServiceForConnection()` returning the first match for backward compatibility
  - Update `connections` command to display all service names for a shared connection

  **Patterns to follow:**
  - Existing `SERVICE_REGISTRY` structure

  **Test scenarios:**
  - `getServiceEntry('calendar')` returns correct entry
  - `getServiceEntry('slack')` returns correct entry
  - `getServicesForConnection('google-oauth2')` returns `['gmail', 'calendar']`
  - `getServicesForConnection('slack')` returns `['slack']`
  - `getAvailableServices()` includes all three
  - `connections` command shows multiple service names for google-oauth2

  **Verification:**
  - All existing service-registry tests pass, new entries validated

- [ ] **Unit 3: Google Calendar service client**

  **Goal:** Create the calendar service client following the Gmail client pattern.

  **Requirements:** R21

  **Dependencies:** Unit 2 (registry entry)

  **Files:**
  - Create: `src/services/calendar/client.ts`
  - Create: `src/services/calendar/types.ts`
  - Create: `src/services/calendar/formatters.ts`
  - Create: `test/services/calendar/client.test.ts`
  - Create: `test/mocks/calendar/handlers.ts`
  - Create: `test/mocks/calendar/data.ts`

  **Approach:**
  - Same `TokenGetter` constructor pattern as `GmailClient`
  - Private `calendar()` method returns `google.calendar({ version: 'v3', auth: this.oauth2 })`
  - Methods: `listCalendars()`, `listEvents(calendarId, opts)`, `getEvent(calendarId, eventId)`, `createEvent(calendarId, event)`, `updateEvent(calendarId, eventId, event)`, `deleteEvent(calendarId, eventId)`, `quickAdd(calendarId, text)`
  - Default `calendarId` to `'primary'` where not specified
  - Types: `CalendarSummary`, `EventSummary`, `EventFull`, `EventListResult`, `EventInput`
  - Formatters: `formatEventList`, `formatEventFull`, `formatCalendarList`

  **Patterns to follow:**
  - `src/services/gmail/client.ts` — class structure, OAuth2Client reuse, method signatures
  - `src/services/gmail/types.ts` — interface naming conventions
  - `src/services/gmail/formatters.ts` — chalk usage, truncation helper

  **Test scenarios:**
  - List calendars returns formatted results
  - List events with date range filtering
  - Get single event returns full details
  - Create event with attendees, time, location
  - Delete event
  - Quick add parses natural language
  - API errors propagate correctly

  **Verification:**
  - All client methods covered by tests using MSW mocks against `googleapis.com/calendar/v3`

- [ ] **Unit 4: Google Calendar commands**

  **Goal:** Create the `auth0-tv calendar` command group with all subcommands.

  **Requirements:** R17, R18, R19, R21

  **Dependencies:** Unit 1 (shared helpers), Unit 3 (calendar client)

  **Files:**
  - Create: `src/commands/calendar/index.ts`
  - Create: `src/commands/calendar/helpers.ts`
  - Create: `src/commands/calendar/list.ts` (list calendars)
  - Create: `src/commands/calendar/events.ts` (list events)
  - Create: `src/commands/calendar/get.ts` (get single event)
  - Create: `src/commands/calendar/create.ts` (create event)
  - Create: `src/commands/calendar/update.ts` (update event)
  - Create: `src/commands/calendar/delete.ts` (delete event)
  - Create: `src/commands/calendar/quick-add.ts` (quick add)
  - Modify: `src/index.ts` (register calendar command group)
  - Create: `test/commands/calendar/helpers.test.ts`

  **Approach:**
  - `createCalendarCommand()` in `index.ts`, registered via `program.addCommand(createCalendarCommand())`
  - `helpers.ts`: `createCalendarClient(cmd)` (same pattern as `createGmailClient`), `handleCalendarError(err, cmd)` (map googleapis error codes to exit codes)
  - Destructive actions (`create`, `update`, `delete`) use `requireConfirmation` from shared helpers
  - `--calendar <id>` option on event commands, defaults to `primary`
  - `events` command has `--from`, `--to` (ISO dates), `--query`, `--max-results` options
  - `create` command: `--summary`, `--start`, `--end`, `--location`, `--description`, `--attendees` (comma-separated)

  **Patterns to follow:**
  - `src/commands/gmail/index.ts` — command group registration
  - `src/commands/gmail/helpers.ts` — client factory, error handler
  - `src/commands/gmail/search.ts` — simple command with options

  **Test scenarios:**
  - `createCalendarClient` wires token exchange correctly
  - `handleCalendarError` maps 401→EXIT_AUTH_REQUIRED, 403→EXIT_AUTHZ_REQUIRED
  - Each command calls correct client method and outputs correctly

  **Verification:**
  - `npm run dev -- calendar --help` shows all subcommands
  - All command tests pass

- [ ] **Unit 5: Slack service client**

  **Goal:** Create the Slack service client using @slack/web-api.

  **Requirements:** R21

  **Dependencies:** Unit 2 (registry entry)

  **Files:**
  - Create: `src/services/slack/client.ts`
  - Create: `src/services/slack/types.ts`
  - Create: `src/services/slack/formatters.ts`
  - Create: `test/services/slack/client.test.ts`
  - Create: `test/mocks/slack/handlers.ts`
  - Create: `test/mocks/slack/data.ts`

  **Approach:**
  - `SlackClient` class with `TokenGetter` constructor (same pattern)
  - Private `api()` method creates `new WebClient(await this.getToken())` — note: WebClient is instantiated per-call since the token may change on refresh
  - Methods: `listChannels(opts)`, `listMessages(channel, opts)`, `searchMessages(query, opts)`, `postMessage(channel, text, opts)`, `replyToThread(channel, threadTs, text)`, `addReaction(channel, timestamp, emoji)`, `removeReaction(channel, timestamp, emoji)`, `listUsers()`, `getUserInfo(userId)`, `setStatus(text, emoji, expiration)`
  - Types: `SlackChannel`, `SlackMessage`, `SlackUser`, `SlackSearchResult`, `MessageListResult`
  - Formatters: `formatChannelList`, `formatMessageList`, `formatSearchResult`, `formatUserList`, `formatUserInfo`
  - Slack API methods: `conversations.list`, `conversations.history`, `search.messages`, `chat.postMessage`, `reactions.add`/`reactions.remove`, `users.list`, `users.info`, `users.profile.set`

  **Patterns to follow:**
  - `src/services/gmail/client.ts` — class structure, TokenGetter pattern
  - `@slack/web-api` `WebClient` — direct method calls, result types

  **Test scenarios:**
  - List channels returns formatted results
  - List messages with pagination (cursor-based)
  - Search messages with Slack query syntax
  - Post message to channel
  - Reply to thread (uses `thread_ts`)
  - Add/remove reaction
  - List users
  - Set status
  - API errors (rate limit, invalid_auth, channel_not_found) propagate correctly

  **Verification:**
  - All client methods covered by MSW mocks against `slack.com/api/`

- [ ] **Unit 6: Slack commands**

  **Goal:** Create the `auth0-tv slack` command group with all subcommands.

  **Requirements:** R17, R18, R19, R21

  **Dependencies:** Unit 1 (shared helpers), Unit 5 (slack client)

  **Files:**
  - Create: `src/commands/slack/index.ts`
  - Create: `src/commands/slack/helpers.ts`
  - Create: `src/commands/slack/channels.ts` (list channels)
  - Create: `src/commands/slack/messages.ts` (list messages in channel)
  - Create: `src/commands/slack/search.ts` (search messages)
  - Create: `src/commands/slack/post.ts` (post message)
  - Create: `src/commands/slack/reply.ts` (reply to thread)
  - Create: `src/commands/slack/react.ts` (add/remove reaction)
  - Create: `src/commands/slack/users.ts` (list users, get user info)
  - Create: `src/commands/slack/status.ts` (set user status)
  - Modify: `src/index.ts` (register slack command group)
  - Create: `test/commands/slack/helpers.test.ts`

  **Approach:**
  - `createSlackCommand()` in `index.ts`, registered via `program.addCommand(createSlackCommand())`
  - `helpers.ts`: `createSlackClient(cmd)` using `exchangeForConnectionToken(config, store, 'sign-in-with-slack')`, `handleSlackError(err, cmd)` mapping Slack error codes to exit codes
  - Destructive actions (`post`, `reply`) use `requireConfirmation` from shared helpers
  - Slack-specific error mapping: `not_authed`/`invalid_auth`/`token_expired`/`token_revoked` → EXIT_AUTH_REQUIRED, `missing_scope` → EXIT_AUTHZ_REQUIRED, `channel_not_found`/`not_in_channel`/`is_archived` → EXIT_INVALID_INPUT. Rate limiting handled automatically by `WebClient`.

  **Patterns to follow:**
  - `src/commands/gmail/index.ts` — command group registration
  - `src/commands/gmail/helpers.ts` — client factory, error handler

  **Test scenarios:**
  - `createSlackClient` wires token exchange correctly
  - `handleSlackError` maps Slack error codes to correct exit codes
  - Each command calls correct client method and outputs correctly
  - `--confirm` required for post/reply in non-TTY mode

  **Verification:**
  - `npm run dev -- slack --help` shows all subcommands
  - All command tests pass

- [ ] **Unit 7: Update docs and skill manifest**

  **Goal:** Update README, skill manifest, and command reference with new services.

  **Requirements:** R20 (help text), R17 (output docs)

  **Dependencies:** Units 4, 6 (all commands implemented)

  **Files:**
  - Modify: `README.md` (add Calendar and Slack sections)
  - Modify: `skills/auth0-token-vault/SKILL.md` (add new service capabilities)
  - Modify: `skills/auth0-token-vault/references/commands.md` (add calendar and slack commands)

  **Approach:**
  - Follow existing Gmail documentation structure exactly
  - Add Calendar and Slack to Quick Start examples
  - Add full command reference for both services
  - Update skill manifest with new capabilities and command patterns

  **Patterns to follow:**
  - Existing Gmail sections in README.md and commands.md

  **Verification:**
  - README has complete command reference for calendar and slack
  - Skill manifest covers all new commands

## System-Wide Impact

- **Service registry:** `CONNECTION_TO_SERVICE` reverse map changes from 1:1 to 1:N. Any code using `getServiceForConnection()` needs audit — currently only `src/commands/connections.ts` uses it.
- **Dependencies:** New npm dependency `@slack/web-api`. No changes to existing deps.
- **Token exchange:** No changes — works generically with any connection name.
- **Connect/disconnect:** Already generic — works with any service in the registry.
- **Error propagation:** Each service has its own error handler mapping service-specific errors to shared exit codes.

## Risks & Dependencies

- **Google scopes on shared connection:** Calendar and Gmail share `google-oauth2`. If a user has connected Gmail but not Calendar, running `auth0-tv connect calendar` needs to prompt for additional Google scopes. This should work via Auth0's Connected Accounts API but depends on tenant configuration.
- **Slack @slack/web-api bundle size:** The package is well-maintained but adds to install size. Acceptable for a CLI tool.
- **Rate limiting:** Both Google Calendar API and Slack have rate limits. The thin passthrough approach means the CLI doesn't handle rate limiting — errors propagate to the user with appropriate exit codes.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md](docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md)
- Related code: `src/services/gmail/` (pattern to follow), `src/commands/gmail/` (command pattern)
- Google Calendar API: googleapis npm package, `google.calendar('v3')`
- Slack Web API: `@slack/web-api` npm package, `WebClient` class
