# auth0-tv Command Reference

Full command reference for agent invocation. All examples use `--json` mode.

## Global options

| Flag                  | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `--json`              | Output structured JSON (required for agent use)          |
| `--confirm` / `--yes` | Skip destructive-action confirmation prompts             |
| `--browser <app>`     | Browser for auth flows (e.g. `firefox`, `google-chrome`) |

Alternatively, set `AUTH0_TV_OUTPUT=json` in the environment instead of passing `--json` on every call.

## Authentication & setup

### login

Authenticate with Auth0 via browser-based PKCE flow. **Requires human interaction** (opens browser).

```bash
auth0-tv login
auth0-tv login --reconfigure   # re-prompt for Auth0 credentials
```

| Flag            | Description                                       |
| --------------- | ------------------------------------------------- |
| `--reconfigure` | Re-prompt for Auth0 domain, client ID, and secret |

### logout

Clear all stored credentials and disconnect all services.

```bash
auth0-tv --json logout
auth0-tv --json logout --local   # clear local credentials only
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
```

### disconnect

Disconnect a third-party service.

```bash
auth0-tv --json disconnect gmail
```

### connections

List connected services.

```bash
auth0-tv --json connections
```

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
