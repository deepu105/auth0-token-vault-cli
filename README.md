# auth0-tv — Auth0 Token Vault CLI

Access third-party services (Gmail, etc.) on behalf of authenticated users via Auth0 Token Vault. Designed for both humans and AI agents.

## Quick Start

```bash
# 1. Configure Auth0 credentials
export AUTH0_DOMAIN="your-tenant.auth0.com"
export AUTH0_CLIENT_ID="your-client-id"
export AUTH0_CLIENT_SECRET="your-client-secret"

# 2. Login
auth0-tv login

# 3. Connect Gmail
auth0-tv connect gmail

# 4. Search emails
auth0-tv gmail search "from:boss@company.com"

# 5. Read an email
auth0-tv gmail read <messageId>
```

## Installation

```bash
npm install -g @auth0/token-vault-cli
```

Requires Node.js 18+.

## Configuration

Set environment variables or create `~/.auth0-tv/config.json`:

```json
{
  "domain": "your-tenant.auth0.com",
  "clientId": "your-client-id",
  "audience": "https://your-api"
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_CLIENT_ID` | Auth0 application client ID |
| `AUTH0_AUDIENCE` | API audience (optional) |

### Auth0 Tenant Setup

1. Create a **Native** application in Auth0 Dashboard
2. Set **Allowed Callback URLs** to: `http://127.0.0.1:18484/callback, http://127.0.0.1:18485/callback, http://127.0.0.1:18486/callback, http://127.0.0.1:18487/callback, http://127.0.0.1:18488/callback, http://127.0.0.1:18489/callback`
3. Enable **Token Exchange** grant for the application
4. Set up a **Google OAuth2** connection with Gmail scopes

## Commands

### Authentication

```bash
auth0-tv login              # Authenticate via browser-based PKCE flow
auth0-tv status             # Show current user and connected services
auth0-tv connect gmail      # Connect Gmail (opens browser)
auth0-tv connections        # List connected services
auth0-tv disconnect gmail   # Disconnect Gmail
```

### Gmail

```bash
auth0-tv gmail search "query"           # Search messages
auth0-tv gmail read <messageId>         # Read a message
auth0-tv gmail send --to a@b.com --subject "Hi" --body "Hello"
auth0-tv gmail reply <messageId> --body "Thanks"
auth0-tv gmail forward <messageId> --to b@c.com
auth0-tv gmail archive <messageId>      # Remove from inbox
auth0-tv gmail delete <messageId>       # Move to trash
auth0-tv gmail labels                   # List labels
auth0-tv gmail label <messageId> --add STARRED --remove INBOX
auth0-tv gmail draft create --to a@b.com --subject "Draft" --body "..."
auth0-tv gmail draft list
auth0-tv gmail draft send <draftId>
auth0-tv gmail draft delete <draftId>
```

## Agent Integration

The CLI is designed as a skill for AI agents (Claude Code, OpenClaw, etc.).

### JSON Mode

Add `--json` for structured output:

```bash
auth0-tv --json gmail search "is:unread" | jq '.data.messages[0].id'
```

### Destructive Actions

In non-interactive mode, destructive commands (send, delete, archive, forward) require `--confirm` or `--yes`:

```bash
auth0-tv --json --confirm gmail send --to a@b.com --subject "Hi" --body "Hello"
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid input / missing required flag |
| 3 | Authentication required (run `auth0-tv login`) |
| 4 | Authorization required (run `auth0-tv connect <service>`) |
| 5 | Service error (upstream API failure) |
| 6 | Network error |

### Body Input Options

For `send`, `reply`, and `draft create`:

```bash
# Inline
auth0-tv gmail send --to a@b.com --subject "Hi" --body "Hello"

# From file
auth0-tv gmail send --to a@b.com --subject "Hi" --body-file ./message.txt

# From stdin
echo "Hello" | auth0-tv gmail send --to a@b.com --subject "Hi" --confirm
```

## Development

```bash
npm install
npm run dev -- --help       # Run CLI in development mode
npm run build               # Compile TypeScript
npm run test                # Run tests
npm run lint                # Lint
```

## Credential Storage

Credentials are stored at `~/.auth0-tv/credentials.json` with restricted file permissions (0600). Token values are never logged or displayed in CLI output.

## License

MIT
