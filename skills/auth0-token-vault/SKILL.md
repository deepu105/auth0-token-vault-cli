---
name: auth0-token-vault
description: >
  Access third-party services (Gmail, Slack, Google Calendar) on behalf of
  authenticated users via Auth0 Token Vault. Use when the user wants to search,
  read, send, or manage emails, connect or disconnect external services, or
  check their authentication and connection status. Wraps the auth0-tv CLI.
compatibility: Requires Node.js 18+ and auth0-tv installed globally (npm i -g auth0-token-vault-cli)
license: MIT
allowed-tools: Bash(auth0-tv *)
metadata:
  author: auth0
  version: '0.1'
  openclaw:
    emoji: "\U0001F510"
    requires:
      bins:
        - auth0-tv
    os:
      - darwin
      - linux
    install:
      - id: npm
        kind: node
        package: 'auth0-token-vault-cli'
        bins: [auth0-tv]
        label: 'Install auth0-tv (npm)'
---

# Auth0 Token Vault CLI

Use the `auth0-tv` command-line tool to access third-party services on behalf of
authenticated users via Auth0 Token Vault.

## Current status

- Auth status: !`auth0-tv --json status 2>/dev/null || echo '{"error":{"code":"not_configured","message":"auth0-tv not configured or not logged in"}}'`

## When to use this skill

- The user asks to read, search, send, reply, forward, archive, or delete emails
- The user wants to manage email drafts or labels
- The user wants to connect or disconnect a third-party service (Gmail, etc.)
- The user asks about their authentication or connection status

## Key patterns

### Always use --json mode

All commands must use `--json` for structured output:

```bash
auth0-tv --json <command>
```

Alternatively, set `AUTH0_TV_OUTPUT=json` in the environment to avoid passing `--json` on every call.

### Destructive actions require --confirm

Commands that modify data (send, delete, archive, forward, reply, draft send, draft delete) require `--confirm`:

```bash
auth0-tv --json --confirm gmail send --to user@example.com --subject "Subject" --body "Body"
```

### Exit codes and recovery

| Code | Meaning             | Recovery action                                   |
| ---- | ------------------- | ------------------------------------------------- |
| 0    | Success             | Parse JSON output                                 |
| 1    | General error       | Report error to user                              |
| 2    | Invalid input       | Check command syntax and required flags           |
| 3    | Auth required       | Tell the user to run `auth0-tv login`             |
| 4    | Connection required | Tell the user to run `auth0-tv connect <service>` |
| 5    | Service error       | Retry or report upstream API failure              |
| 6    | Network error       | Check connectivity, retry                         |

**Important:** Exit codes 3 and 4 require human intervention — `login` and `connect` open a browser for OAuth. Do not attempt to run these commands autonomously; instead, tell the user what to run.

### Body input for email composition

For `send`, `reply`, and `draft create`, the message body can be provided via:

- `--body "inline text"` — short messages
- `--body-file ./message.txt` — longer messages from a file
- stdin: `echo "body" | auth0-tv --json --confirm gmail send --to ... --subject ...`

Prefer `--body-file` or stdin for messages containing special characters.

## Available commands

### Authentication & setup

- `auth0-tv login` — authenticate via browser (human-in-the-loop)
- `auth0-tv logout` — clear stored credentials
- `auth0-tv status` — show current user and connected services
- `auth0-tv connect <service>` — connect a service via browser (human-in-the-loop)
- `auth0-tv disconnect <service>` — disconnect a service
- `auth0-tv connections` — list connected services

### Gmail

- `auth0-tv gmail search <query>` — search messages (supports Gmail search syntax)
- `auth0-tv gmail read <messageId>` — read a message
- `auth0-tv gmail send` — send a new message (destructive)
- `auth0-tv gmail reply <messageId>` — reply to a message (destructive)
- `auth0-tv gmail forward <messageId>` — forward a message (destructive)
- `auth0-tv gmail archive <messageId>` — archive a message (destructive)
- `auth0-tv gmail delete <messageId>` — move to trash (destructive)
- `auth0-tv gmail labels` — list labels
- `auth0-tv gmail label <messageId>` — add/remove labels
- `auth0-tv gmail draft create` — create a draft
- `auth0-tv gmail draft list` — list drafts
- `auth0-tv gmail draft send <draftId>` — send a draft (destructive)
- `auth0-tv gmail draft delete <draftId>` — delete a draft (destructive)

See [references/commands.md](references/commands.md) for full command reference with flags and JSON output examples.
