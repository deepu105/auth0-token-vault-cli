# auth0-tv — Auth0 Token Vault CLI

Access third-party [services](https://auth0.com/ai/docs/integrations/overview) (Gmail, Slack, etc.) on behalf of authenticated users via [Auth0 Token Vault](https://auth0.com/ai/docs/intro/token-vault). Designed for both humans and AI agents.

## Auth0 Tenant Setup

### Prerequisites

- An [Auth0 Account](https://auth0.com/signup?onboard_app=auth_for_aa&ocid=701KZ000000cXXxYAM-aPA4z0000008OZeGAM)
- [Auth0 CLI](https://github.com/auth0/auth0-cli) installed and logged in
- At least one [connection](https://auth0.com/ai/docs/integrations/overview) configured (e.g. [Google](https://auth0.com/ai/docs/integrations/google))

### Install the Auth0 CLI

```bash
# macOS
brew tap auth0/auth0-cli && brew install auth0

# Other platforms — see https://github.com/auth0/auth0-cli
```

### Configure Token Vault

Run the interactive setup wizard. It logs you into Auth0 CLI then creates and configures an Auth0 application with Token Vault, My Account API, MRRT, and client grants — everything that `auth0-tv` needs:

```bash
npx configure-auth0-token-vault
```

1. When asked, **How would you like to configure the application?**, select **Create a new application**. If you already have an application you'd like to use, select **Use an existing application** and follow the prompts to set it up for Token Vault.
2. If asked, **Select application type**, choose **Regular Web Application**.
3. When asked, **Which Token Vault configuration do you need?**, select **Refresh Token Exchange**.

The wizard will:

- Configures the Regular Web Application with the necessary settings for Token Vault
- Enable the Token Vault grant type
- Activate the My Account API with Connected Accounts scopes
- Create the necessary client grants
- Configure Multi-Resource Refresh Token (MRRT) policies
- Enable your social connections on the application

Note the **Client ID** from the output — you'll need them for `auth0-tv login`.

> **Tip:** The wizard is idempotent — safe to re-run if you need to update the configuration.

### Configure callback URLs

After running the wizard, configure your application's callback and logout URLs for `auth0-tv` using the Auth0 CLI. Replace `<APP_ID>` with the Client ID from the previous step:

```bash
auth0 apps update <APP_ID> \
  --callbacks "http://127.0.0.1:18484/callback,http://127.0.0.1:18485/callback,http://127.0.0.1:18486/callback,http://127.0.0.1:18487/callback,http://127.0.0.1:18488/callback,http://127.0.0.1:18489/callback" \
  --logout-urls "http://127.0.0.1:18484,http://127.0.0.1:18485,http://127.0.0.1:18486,http://127.0.0.1:18487,http://127.0.0.1:18488,http://127.0.0.1:18489"
```

If you plan to use a custom `--port`, add that port's URLs as well.

### Get Client Secret

Retrieve your application's client secret (needed during `auth0-tv login`):

```bash
auth0 apps show <APP_ID> --reveal-secrets
```

## Installation

```bash
npm install -g auth0-token-vault-cli
```

Requires Node.js 20+.

## Quick Start

### 1. Login

```bash
auth0-tv login
```

### 2. Connect Gmail

```bash
auth0-tv connect gmail
```

### 3. Search emails

```bash
auth0-tv gmail search "from:boss@company.com"
```

### 4. Read an email

```bash
auth0-tv gmail read <messageId>

```

## Agent Integration

The CLI is designed as a skill for [AgentSkills-compatible](https://agentskills.io/) AI agents (OpenClaw, Claude Code, etc.).

### Agent Skills

The CLI ships with an [Agent Skills](https://agentskills.io) manifest that enables automatic discovery in supported agent frameworks.

**In-project discovery (automatic):** When working in this repo, agents discover the skill automatically:

- **OpenClaw:** via `skills/auth0-token-vault/SKILL.md`
- **Claude Code:** via `.claude/skills/auth0-token-vault/SKILL.md` (symlink)

**Global installation:** For use outside this repo, install `auth0-tv` globally and copy the skill:

```bash
npm install -g auth0-token-vault-cli

# Claude Code
cp -r skills/auth0-token-vault ~/.claude/skills/

# OpenClaw
cp -r skills/auth0-token-vault ~/.openclaw/skills/
```

> **Note:** Global `npm install -g` is required for agent use. Agents cannot discover `auth0-tv` when run via `npx` or from a local `node_modules/` install.

## Configuration

Set environment variables **or** run `auth0-tv login`, which prompts for the required values and persists them in the credential store. Each field is resolved individually: environment variable takes precedence over stored value.

### Environment Variables

| Variable              | Description                                         |
| --------------------- | --------------------------------------------------- |
| `AUTH0_DOMAIN`        | Auth0 tenant domain                                 |
| `AUTH0_CLIENT_ID`     | Auth0 application client ID                         |
| `AUTH0_CLIENT_SECRET` | Auth0 application client secret                     |
| `AUTH0_AUDIENCE`      | API audience (optional)                             |
| `AUTH0_TV_OUTPUT`     | Set to `json` to auto-enable JSON output for agents |
| `AUTH0_TV_STORAGE`    | Credential backend: `keyring` (default) or `file`   |
| `AUTH0_TV_BROWSER`    | Browser to open for auth flows (e.g. `firefox`)     |
| `AUTH0_TV_PORT`       | Port for the local OAuth callback server            |

## Commands

### Authentication

```bash
auth0-tv login                    # Authenticate via browser-based PKCE flow
auth0-tv --port 18486 login       # Force callback server to a specific port
auth0-tv status                   # Show current user and connected services
auth0-tv connect gmail            # Connect Gmail (opens browser)
auth0-tv --port 18486 connect gmail
auth0-tv --port 18486 logout
auth0-tv connections              # List connected services (remote + local status)
auth0-tv disconnect gmail         # Disconnect Gmail (local only)
auth0-tv disconnect gmail --remote  # Disconnect Gmail (local + remote)
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

### Global Flags

| Flag                  | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `--json`              | Output structured JSON (recommended for agents/scripts)              |
| `--confirm` / `--yes` | Skip destructive-action confirmation prompts                         |
| `--browser <app>`     | Browser for auth flows (e.g. `firefox`, `google-chrome`)             |
| `--port <number>`     | Port for the local OAuth callback server (default: auto 18484-18489) |

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

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | Success                                                   |
| 1    | General error                                             |
| 2    | Invalid input / missing required flag                     |
| 3    | Authentication required (run `auth0-tv login`)            |
| 4    | Authorization required (run `auth0-tv connect <service>`) |
| 5    | Service error (upstream API failure)                      |
| 6    | Network error                                             |

### Gmail Body Input Options

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

Credentials are stored in the OS Keyring by default with a fallback to `~/.auth0-tv/credentials.json` with restricted file permissions (0600). Token values are never logged or displayed in CLI output.

## License

MIT

## Gaps/Todo

- [ ] Refresh token expiry relies on error handling and re-authentication
- [ ] Add more services (Slack, Google Calendar, etc.)
- [ ] Use access_token instead of refresh token. Configurable.
- [ ] MCP wrapper?
- [ ] keytar replacement? Maybe with @napi-rs/keyring
- [ ] lockfile for filestore?
