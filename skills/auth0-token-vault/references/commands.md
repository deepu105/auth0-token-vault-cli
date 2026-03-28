# auth0-tv Command Reference

Full command reference for agent invocation. All examples use `--json` mode.

## Global options

| Flag                  | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `--json`              | Output structured JSON (required for agent use)                      |
| `--confirm` / `--yes` | Skip destructive-action confirmation prompts                         |
| `--browser <app>`     | Browser for auth flows (e.g. `firefox`, `google-chrome`)             |
| `--port <number>`     | Port for the local OAuth callback server (default: auto 18484-18489) |

Alternatively, set `AUTH0_TV_OUTPUT=json` in the environment instead of passing `--json` on every call.

## Authentication & setup

### login

Authenticate with Auth0 via browser-based PKCE flow. **Requires human interaction** (opens browser).

```bash
auth0-tv login
auth0-tv login --reconfigure   # re-prompt for Auth0 credentials
auth0-tv --port 18486 login    # bind callback server to a specific port
```

| Flag            | Description                                       |
| --------------- | ------------------------------------------------- |
| `--reconfigure` | Re-prompt for Auth0 domain, client ID, and secret |

### logout

Clear all stored credentials and disconnect all services.

```bash
auth0-tv --json logout
auth0-tv --json logout --local   # clear local credentials only
auth0-tv --json --port 18486 logout
```

| Flag      | Description                                                     |
| --------- | --------------------------------------------------------------- |
| `--local` | Only clear local credentials without ending the browser session |

### status

Show current user and connected services.

```bash
auth0-tv --json status
```

Example JSON output:

```json
{
  "loggedIn": true,
  "user": { "email": "user@example.com", "name": "User Name" },
  "connections": ["google-oauth2"]
}
```

### connect

Connect a third-party service. **Requires human interaction** (opens browser for OAuth).

```bash
auth0-tv connect gmail
auth0-tv --port 18486 connect gmail
```

Connect a service. No command-specific flags.

### disconnect

Disconnect a third-party service. By default, only removes the locally-cached token. Use `--remote` to also remove the server-side connection from Auth0 Token Vault.

```bash
auth0-tv --json disconnect gmail
auth0-tv --json disconnect gmail --remote
```

| Flag       | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `--remote` | Also remove the server-side connection (Auth0 Token Vault) |

Example JSON output (local only):

```json
{ "status": "disconnected", "service": "gmail", "remote": false }
```

Example JSON output (with `--remote`):

```json
{ "status": "disconnected", "service": "gmail", "remote": true }
```

### connections

List connected services. When logged in, fetches remote connected accounts from Auth0 and shows the local token status for each. Falls back to local-only listing when not logged in or if the remote API is unreachable.

```bash
auth0-tv --json connections
```

Example JSON output (logged in, remote available):

```json
{
  "connections": [
    {
      "connection": "google-oauth2",
      "service": "gmail",
      "id": "ca_abc123",
      "scopes": ["https://www.googleapis.com/auth/gmail.modify"],
      "tokenStatus": "valid",
      "remote": true
    },
    {
      "connection": "slack",
      "service": "slack",
      "id": "ca_def456",
      "scopes": ["chat:write"],
      "tokenStatus": "none",
      "remote": true
    }
  ]
}
```

The `tokenStatus` field indicates local token availability:

- `valid` — local token is cached and not expired
- `expired` — local token is cached but expired
- `none` — no local token (remote-only connection)

The `remote` field indicates whether the entry came from the Auth0 server (`true`) or from local cache only (`false`, when not logged in).

## Gmail commands

All Gmail commands require a connected Gmail account. If not connected, the CLI exits with code 4.

### gmail search

Search messages using Gmail search syntax.

```bash
auth0-tv --json gmail search "from:boss@company.com is:unread"
auth0-tv --json gmail search "meeting notes" -n 5
auth0-tv --json gmail search "in:inbox" --page-token <token>
```

| Flag                    | Description               | Default |
| ----------------------- | ------------------------- | ------- |
| `-n, --max-results <n>` | Maximum results to return | 10      |
| `--page-token <token>`  | Page token for pagination | —       |

### gmail read

Read a message by ID.

```bash
auth0-tv --json gmail read <messageId>
```

### gmail send

Send a new message. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm gmail send --to user@example.com --subject "Subject" --body "Body text"
auth0-tv --json --confirm gmail send --to user@example.com --subject "Subject" --body-file ./message.txt
echo "Body" | auth0-tv --json --confirm gmail send --to user@example.com --subject "Subject"
```

| Flag                  | Description                        |
| --------------------- | ---------------------------------- |
| `--to <address>`      | Recipient email address (required) |
| `--subject <subject>` | Email subject (required)           |
| `--body <text>`       | Email body text                    |
| `--body-file <path>`  | Read body from file                |

Body can also be provided via stdin when neither `--body` nor `--body-file` is specified.

### gmail reply

Reply to a message. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm gmail reply <messageId> --body "Thanks!"
auth0-tv --json --confirm gmail reply <messageId> --body-file ./reply.txt
```

| Flag                 | Description         |
| -------------------- | ------------------- |
| `--body <text>`      | Reply body text     |
| `--body-file <path>` | Read body from file |

### gmail forward

Forward a message. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm gmail forward <messageId> --to recipient@example.com
```

| Flag             | Description                        |
| ---------------- | ---------------------------------- |
| `--to <address>` | Recipient email address (required) |

### gmail archive

Archive a message (remove from inbox). **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm gmail archive <messageId>
```

### gmail delete

Move a message to trash. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm gmail delete <messageId>
```

### gmail labels

List all labels.

```bash
auth0-tv --json gmail labels
```

### gmail label

Add or remove labels from a message.

```bash
auth0-tv --json gmail label <messageId> --add STARRED
auth0-tv --json gmail label <messageId> --remove INBOX --add ARCHIVED
auth0-tv --json gmail label <messageId> --add "Label_1,Label_2"
```

| Flag                | Description                         |
| ------------------- | ----------------------------------- |
| `--add <labels>`    | Comma-separated label IDs to add    |
| `--remove <labels>` | Comma-separated label IDs to remove |

### gmail draft create

Create a new draft.

```bash
auth0-tv --json gmail draft create --to user@example.com --subject "Draft" --body "Content"
auth0-tv --json gmail draft create --to user@example.com --subject "Draft" --body-file ./draft.txt
```

| Flag                  | Description             |
| --------------------- | ----------------------- |
| `--to <address>`      | Recipient email address |
| `--subject <subject>` | Email subject           |
| `--body <text>`       | Draft body text         |
| `--body-file <path>`  | Read body from file     |

### gmail draft list

List drafts.

```bash
auth0-tv --json gmail draft list
auth0-tv --json gmail draft list -n 5
```

| Flag                    | Description     | Default |
| ----------------------- | --------------- | ------- |
| `-n, --max-results <n>` | Maximum results | 20      |

### gmail draft send

Send an existing draft. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm gmail draft send <draftId>
```

### gmail draft delete

Delete a draft. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm gmail draft delete <draftId>
```

## Google Calendar commands

All Calendar commands require a connected Google Calendar account. If not connected, the CLI exits with code 4.

### calendar list

List calendars the user has access to.

```bash
auth0-tv --json calendar list
auth0-tv --json calendar list --max-results 5
```

| Flag                    | Description               | Default |
| ----------------------- | ------------------------- | ------- |
| `--max-results <n>`     | Maximum results to return | 100     |

### calendar events

List events from a calendar.

```bash
auth0-tv --json calendar events
auth0-tv --json calendar events primary --from 2026-03-28T00:00:00Z --to 2026-04-04T00:00:00Z
auth0-tv --json calendar events --query "standup" --max-results 5
```

| Flag                    | Description                         | Default   |
| ----------------------- | ----------------------------------- | --------- |
| `[calendarId]`          | Calendar ID                         | `primary` |
| `--from <date>`         | Start date (ISO 8601)               | —         |
| `--to <date>`           | End date (ISO 8601)                 | —         |
| `--query <text>`        | Free-text search                    | —         |
| `--max-results <n>`     | Maximum results to return           | 25        |
| `--page-token <token>`  | Page token for pagination           | —         |

### calendar get

Get details for a specific event.

```bash
auth0-tv --json calendar get <eventId>
auth0-tv --json calendar get <eventId> --calendar <calendarId>
```

| Flag                  | Description  | Default   |
| --------------------- | ------------ | --------- |
| `--calendar <id>`     | Calendar ID  | `primary` |

### calendar create

Create a new event. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm calendar create --summary "Meeting" --start 2026-03-28T10:00:00 --end 2026-03-28T11:00:00
auth0-tv --json --confirm calendar create --summary "Lunch" --start 2026-03-28T12:00:00 --end 2026-03-28T13:00:00 --location "Cafe" --attendees "a@b.com,c@d.com" --description "Team lunch"
```

| Flag                      | Description                       |
| ------------------------- | --------------------------------- |
| `--summary <text>`        | Event title (required)            |
| `--start <datetime>`      | Start time, ISO 8601 (required)   |
| `--end <datetime>`        | End time, ISO 8601 (required)     |
| `--location <text>`       | Event location                    |
| `--description <text>`    | Event description                 |
| `--attendees <emails>`    | Comma-separated attendee emails   |
| `--calendar <id>`         | Calendar ID (default: `primary`)  |

### calendar update

Update an existing event. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm calendar update <eventId> --summary "New Title"
auth0-tv --json --confirm calendar update <eventId> --start 2026-03-28T14:00:00 --end 2026-03-28T15:00:00
```

All fields are optional — only provided fields are updated (uses PATCH).

| Flag                      | Description                       |
| ------------------------- | --------------------------------- |
| `--summary <text>`        | Event title                       |
| `--start <datetime>`      | Start time, ISO 8601              |
| `--end <datetime>`        | End time, ISO 8601                |
| `--location <text>`       | Event location                    |
| `--description <text>`    | Event description                 |
| `--attendees <emails>`    | Comma-separated attendee emails   |
| `--calendar <id>`         | Calendar ID (default: `primary`)  |

### calendar delete

Delete an event. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm calendar delete <eventId>
auth0-tv --json --confirm calendar delete <eventId> --calendar <calendarId>
```

| Flag              | Description                       |
| ----------------- | --------------------------------- |
| `--calendar <id>` | Calendar ID (default: `primary`)  |

### calendar quick-add

Create an event using natural language. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm calendar quick-add "Lunch with Alice tomorrow at noon at Cafe Nero"
```

| Flag              | Description                       |
| ----------------- | --------------------------------- |
| `--calendar <id>` | Calendar ID (default: `primary`)  |

## Slack commands

All Slack commands require a connected Slack account. If not connected, the CLI exits with code 4.

### slack channels

List Slack channels the user is in.

```bash
auth0-tv --json slack channels
auth0-tv --json slack channels --limit 50
```

| Flag              | Description               | Default |
| ----------------- | ------------------------- | ------- |
| `--limit <n>`     | Maximum results per page  | 100     |
| `--cursor <token>`| Pagination cursor         | —       |

### slack messages

List messages in a channel.

```bash
auth0-tv --json slack messages C1234567890
auth0-tv --json slack messages C1234567890 --limit 20 --oldest 1609459200
```

| Flag               | Description                    | Default |
| ------------------ | ------------------------------ | ------- |
| `--limit <n>`      | Maximum messages per page      | 50      |
| `--cursor <token>` | Pagination cursor              | —       |
| `--oldest <ts>`    | Start of time range (Unix ts)  | —       |
| `--latest <ts>`    | End of time range (Unix ts)    | —       |

### slack search

Search Slack messages. Supports Slack search syntax (`from:@user`, `in:#channel`, `has:link`, etc.).

```bash
auth0-tv --json slack search "project update"
auth0-tv --json slack search "from:@alice in:#general" --count 5
```

| Flag                | Description                        | Default     |
| ------------------- | ---------------------------------- | ----------- |
| `--sort <field>`    | Sort by `timestamp` or `score`     | `timestamp` |
| `--sort-dir <dir>`  | Sort direction: `asc` or `desc`    | `desc`      |
| `--count <n>`       | Results per page (max 100)         | 20          |
| `--page <n>`        | Page number (1-indexed)            | 1           |

### slack post

Post a message to a channel. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm slack post C1234567890 --text "Hello team!"
```

| Flag           | Description              |
| -------------- | ------------------------ |
| `--text <msg>` | Message text (required)  |

### slack reply

Reply to a thread. **Destructive — requires `--confirm`.**

```bash
auth0-tv --json --confirm slack reply C1234567890 1234567890.123456 --text "Got it!"
```

| Flag           | Description              |
| -------------- | ------------------------ |
| `--text <msg>` | Reply text (required)    |

### slack react

Add or remove an emoji reaction on a message.

```bash
auth0-tv --json slack react C1234567890 1234567890.123456 --add thumbsup
auth0-tv --json slack react C1234567890 1234567890.123456 --remove thumbsup
```

| Flag              | Description                      |
| ----------------- | -------------------------------- |
| `--add <emoji>`   | Emoji name to add (no colons)    |
| `--remove <emoji>`| Emoji name to remove (no colons) |

### slack users

List Slack users.

```bash
auth0-tv --json slack users
auth0-tv --json slack users --limit 50
```

| Flag              | Description              | Default |
| ----------------- | ------------------------ | ------- |
| `--limit <n>`     | Maximum results per page | 200     |
| `--cursor <token>`| Pagination cursor        | —       |

### slack user

Get info about a specific Slack user.

```bash
auth0-tv --json slack user U1234567890
```

### slack status

Set your Slack status.

```bash
auth0-tv --json slack status --text "In a meeting" --emoji ":calendar:" --expiration 60
```

| Flag                  | Description                            |
| --------------------- | -------------------------------------- |
| `--text <text>`       | Status text (required)                 |
| `--emoji <emoji>`     | Status emoji (e.g. `:calendar:`)       |
| `--expiration <mins>` | Minutes until status expires (0 = never)|

## Exit codes

| Code | Constant              | Meaning                                                            |
| ---- | --------------------- | ------------------------------------------------------------------ |
| 0    | —                     | Success                                                            |
| 1    | `EXIT_GENERAL`        | General / unexpected error                                         |
| 2    | `EXIT_INVALID_INPUT`  | Invalid input or missing required flag                             |
| 3    | `EXIT_AUTH_REQUIRED`  | Authentication required — user must run `auth0-tv login`           |
| 4    | `EXIT_AUTHZ_REQUIRED` | Service not connected — user must run `auth0-tv connect <service>` |
| 5    | `EXIT_SERVICE_ERROR`  | Upstream service error (e.g. Gmail API failure)                    |
| 6    | `EXIT_NETWORK_ERROR`  | Network error (unreachable host, timeout)                          |

## Error JSON format

When `--json` is active, errors are returned as structured JSON to stdout:

```json
{
  "error": {
    "code": "token_exchange_error",
    "message": "Service not connected. Run `auth0-tv connect gmail` first."
  }
}
```
