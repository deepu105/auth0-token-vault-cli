# auth0-tv — Auth0 Token Vault CLI

Access third-party [services](https://auth0.com/ai/docs/integrations/overview) (Gmail, Slack, etc.) on behalf of authenticated users via [Auth0 Token Vault](https://auth0.com/ai/docs/intro/token-vault). Designed for both humans and AI agents.

For a lightweight and flexible proxy instead of this CLI, use [Auth0 Token Vault Proxy](https://github.com/deepu105/token-vault-proxy)

## Available Services

- [Gmail](https://auth0.com/ai/docs/integrations/google)
- [Google Calendar](https://auth0.com/ai/docs/integrations/google)
- [Slack](https://auth0.com/ai/docs/integrations/slack)
- [GitHub](https://auth0.com/ai/docs/integrations/github)
- [Google Drive](https://auth0.com/ai/docs/integrations/google) - coming soon!
- [Google Contacts](https://auth0.com/ai/docs/integrations/google) - coming soon!
- [Google Tasks](https://auth0.com/ai/docs/integrations/google) - coming soon!
- More coming soon!

## Prerequisites

- An [Auth0 Account](https://auth0.com/signup?onboard_app=auth_for_aa&ocid=701KZ000000cXXxYAM-aPA4z0000008OZeGAM)
- [Auth0 CLI](https://github.com/auth0/auth0-cli) installed and logged in
- At least one [connection](https://auth0.com/ai/docs/integrations/overview) configured (e.g. [Google](https://auth0.com/ai/docs/integrations/google))

## Quick Start

```bash
# Install
npm install -g auth0-token-vault-cli

# Run the guided setup wizard (recommended for first-time setup)
auth0-tv init
```

The `init` wizard will:

1. Check prerequisites (Auth0 CLI, Node.js)
2. Run the Token Vault configuration wizard
3. Configure callback URLs
4. Retrieve your credentials
5. Authenticate via browser

After setup, connect services and start using them:

```bash
auth0-tv connect gmail
auth0-tv gmail search "from:boss@company.com"
auth0-tv calendar events
auth0-tv slack search "project update"
```

## Auth0 Tenant Setup

> **Tip:** The `auth0-tv init` command automates all of these steps. Use manual setup only if you need more control.

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

## Manual Setup

If you prefer manual setup over `auth0-tv init`:

### 1. Login

```bash
auth0-tv login
```

### 2. Connect a service

```bash
auth0-tv connect gmail
auth0-tv connect calendar
auth0-tv connect slack
auth0-tv connect github
```

### 3. Search emails

```bash
auth0-tv gmail search "from:boss@company.com"
```

### 4. Check upcoming events

```bash
auth0-tv calendar events --from 2026-03-28T00:00:00Z
```

### 5. Search Slack

```bash
auth0-tv slack search "project update"
```

## Agent Integration

The CLI is designed as a skill for [AgentSkills-compatible](https://agentskills.io/) AI agents (OpenClaw, Claude Code, etc.).

### Agent Skills

The CLI ships with an [Agent Skills](https://agentskills.io) manifest that enables automatic discovery in supported agent frameworks.

**Claude Code plugin marketplace:** Install the skill directly in Claude Code:

```
/plugin marketplace add deepu105/auth0-token-vault-cli
```

Then browse and install:

```
/plugin install auth0-token-vault@auth0-token-vault
```

**ClawHub (OpenClaw skill registry):** Install the skill via [ClawHub](https://clawhub.ai):

```bash
npx clawhub@latest install auth0-token-vault
```

**Global installation (manual):** For use outside this repo, install `auth0-tv` globally and copy the skill:

```bash
npm install -g auth0-token-vault-cli

# Claude Code
cp -r skills/auth0-token-vault ~/.claude/skills/

# OpenClaw
cp -r skills/auth0-token-vault ~/.openclaw/skills/
```

> **Note:** Global `npm install -g` is required for agent use. Agents cannot discover `auth0-tv` when run via `npx` or from a local `node_modules/` install.

**In-project discovery (automatic):** When working in this repo, agents discover the skill automatically:

- **OpenClaw:** via `skills/auth0-token-vault/SKILL.md`
- **Claude Code:** via `.claude/skills/auth0-token-vault/SKILL.md` (symlink)

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
auth0-tv init                     # Interactive guided setup wizard (recommended first time)
auth0-tv login                    # Authenticate via browser-based PKCE flow
auth0-tv login --reconfigure      # Re-prompt for Auth0 domain, client ID, and secret
auth0-tv --port 18486 login       # Force callback server to a specific port
auth0-tv status                   # Show current user and connected services
auth0-tv connect gmail            # Connect Gmail (opens browser)
auth0-tv connect calendar         # Connect Google Calendar
auth0-tv connect slack            # Connect Slack
auth0-tv connect github           # Connect GitHub
auth0-tv connect github --allowed-domains "ghcr.io"  # Add extra allowed domains for fetch
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

### Google Calendar

```bash
auth0-tv calendar list                           # List calendars
auth0-tv calendar events                         # List upcoming events (primary calendar)
auth0-tv calendar events --from 2026-03-28T00:00:00Z --to 2026-04-04T00:00:00Z
auth0-tv calendar events --query "standup"       # Search events
auth0-tv calendar get <eventId>                  # Get event details
auth0-tv calendar create --summary "Meeting" --start 2026-03-28T10:00:00 --end 2026-03-28T11:00:00
auth0-tv calendar create --summary "Lunch" --start 2026-03-28T12:00:00 --end 2026-03-28T13:00:00 --location "Cafe" --attendees "a@b.com,c@d.com"
auth0-tv calendar update <eventId> --summary "Updated title"
auth0-tv calendar delete <eventId>               # Delete an event
auth0-tv calendar quick-add "Lunch tomorrow at noon"
```

### Slack

```bash
auth0-tv slack channels                          # List channels
auth0-tv slack messages <channel>                # List messages in a channel
auth0-tv slack messages <channel> --oldest 1609459200 --latest 1609545600
auth0-tv slack search "project update"           # Search messages
auth0-tv slack post <channel> --text "Hello!"    # Post a message
auth0-tv slack reply <channel> <threadTs> --text "Got it"
auth0-tv slack react <channel> <timestamp> --add thumbsup
auth0-tv slack react <channel> <timestamp> --remove thumbsup
auth0-tv slack users                             # List users
auth0-tv slack user <userId>                     # Get user info
auth0-tv slack status --text "In a meeting" --emoji ":calendar:" --expiration 60
```

### GitHub

```bash
auth0-tv github repos                              # List your repositories
auth0-tv github repos --sort stars --type all      # Sort by stars, all types
auth0-tv github repo octocat/Hello-World           # Get repository details
auth0-tv github issues octocat/Hello-World         # List issues
auth0-tv github issues octocat/Hello-World --state closed --labels bug
auth0-tv github issue get octocat/Hello-World 1    # Get issue details
auth0-tv github issue create octocat/Hello-World --title "Bug" --body "Details"
auth0-tv github issue comment octocat/Hello-World 1 --body "Fixed!"
auth0-tv github issue close octocat/Hello-World 1  # Close an issue
auth0-tv github prs octocat/Hello-World            # List pull requests
auth0-tv github pr get octocat/Hello-World 42      # Get PR details
auth0-tv github pr comment octocat/Hello-World 42 --body "LGTM"
auth0-tv github notifications                      # List unread notifications
auth0-tv github notifications --all                # Include read notifications
auth0-tv github notification read <id>             # Mark notification as read
auth0-tv github search repos "auth0 language:typescript"
auth0-tv github search code "handleError repo:octocat/Hello-World"
auth0-tv github search issues "bug label:critical"
```

### API Passthrough (fetch)

Make authenticated HTTP requests to allowed domains using a service's token. Only HTTPS URLs are permitted. Each service has default allowed domains built in:

| Service    | Default allowed domains    |
| ---------- | -------------------------- |
| `gmail`    | `*.googleapis.com`         |
| `calendar` | `*.googleapis.com`         |
| `github`   | `api.github.com`           |
| `slack`    | `slack.com`, `*.slack.com` |

```bash
auth0-tv fetch github https://api.github.com/user
auth0-tv fetch gmail https://gmail.googleapis.com/gmail/v1/users/me/messages
auth0-tv fetch slack https://slack.com/api/conversations.list
auth0-tv fetch github https://api.github.com/repos/octocat/Hello-World/issues -X POST -d '{"title":"Bug"}'
auth0-tv fetch github https://api.github.com/user -H "Accept: application/vnd.github.v3+json"
auth0-tv fetch slack https://slack.com/api/chat.postMessage -X POST --data-file ./payload.json
```

The `Authorization: Bearer <token>` header is injected automatically. Add extra domains with `--allowed-domains` on `connect`:

```bash
auth0-tv connect github --allowed-domains "ghcr.io,uploads.github.com"
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
npm run check               # Format, lint, and typecheck without modifying files
npm run verify              # Full local verification: check + tests
npm run build               # Compile TypeScript
npm run test                # Run tests
npm run lint                # Lint
```

## Release

Releases are tag-driven. Publishing to npm is handled by GitHub Actions when you push a version tag that points to a commit on `main`.

Local release verification:

```bash
npm install
npm run release:check
```

This runs the same gates used by the publish workflow:

- `npm run check`
- `npm test`
- `npm run build`

To cut a release:

```bash
npm version patch
git push origin main --follow-tags
```

For `minor` or `major` releases, replace `patch` with the appropriate semver bump. The publish workflow will:

- verify the tagged commit is reachable from `main`
- run `npm run release:check`
- publish to npm with provenance
- create the GitHub release notes automatically

After the npm release, publish the updated skill to [ClawHub](https://clawhub.ai):

```bash
clawhub publish ./skills/auth0-token-vault \
  --slug auth0-token-vault \
  --version <new-version> \
  --tags latest \
  --changelog "<changelog>"
```

## Credential Storage

Credentials are stored in the OS Keyring by default with a fallback to `~/.auth0-tv/credentials.json` with restricted file permissions (0600). Token values are never logged or displayed in CLI output.

## License

MIT

## Gaps/Todo

- [ ] Demo video
- [ ] Add more services (Google Drive, Google Contacts, Google Tasks, etc.)
- [ ] Use access_token instead of refresh token. Configurable?
- [ ] Refresh token expiry relies on error handling and re-authentication
- [ ] MCP wrapper?
- [ ] keytar replacement? Maybe with @napi-rs/keyring
- [ ] lockfile for filestore?
