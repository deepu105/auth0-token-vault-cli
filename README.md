# auth0-tv — Auth0 Token Vault CLI

Access third-party [services](https://auth0.com/ai/docs/integrations/overview) (Gmail, Slack, etc.) on behalf of authenticated users via [Auth0 Token Vault](https://auth0.com/ai/docs/intro/token-vault). Designed for both humans and AI agents.

## Auth0 Tenant Setup

1. Create an [Auth0 Account](https://auth0.com/signup?onboard_app=auth_for_aa&ocid=701KZ000000cXXxYAM-aPA4z0000008OZeGAM).

2. Create an Auth0 Application. Go to your [Auth0 Dashboard](https://manage.auth0.com/dashboard) to create a new Auth0 Application.
   1. Navigate to **Applications** > **Applications** in the left sidebar.
   2. Click the **Create Application** button in the top right.
   3. In the pop-up select **Regular Web Applications** and click **Create**.
   4. Once the Application is created, switch to the **Settings** tab.
   5. Scroll down to the **Application URIs** section.
   6. Set **Allowed Callback URLs** as: `http://127.0.0.1:18484/callback` (you can also add the other callback URLs with different ports: 18485, 18486, 18487, 18488, 18489).
   7. Set **Allowed Logout URLs** as: http://127.0.0.1:18484
   8. Scroll down to the **Refresh Token Rotation** section and disable the **Allow Refresh Token Rotation** option.
   9. Scroll down and expand the **Advanced** section. Switch to the **Grant Types** tab and enable the **Token Vault** grant type.\
   10. Click **Save** in the bottom right to save your changes.

3. Configure [My Account API](https://auth0.com/docs/manage-users/my-account-api). The Connected Accounts flow uses the My Account API to create and manage connected accounts for a user across supported external providers.
   1. Navigate to [**Applications** > **APIs**](https://manage.auth0.com/#/apis), locate the **My Account API** banner, and select **Activate** to activate the Auth0 My Account API.
   2. Once activated, select **Auth0 My Account API** and then select the **Application Access** tab.
   3. Find your client application and select **Edit** to configure its [application access policies](https://www.auth0.com//docs/get-started/apis/api-access-policies-for-applications).
   4. Select **User Access** and under **Authorization**, select **Authorized**.
   5. For the permissions, select **All the [Connected Accounts scopes](https://www.auth0.com/docs/manage-users/my-account-api#scope)** for the application.
   6. Select **Save**. This creates a client grant that allows your client application to access the My Account API with the Connected Accounts scopes on the user's behalf.
   7. Navigate to the **Settings** tab. Under **Access Settings**, select **Allow Skipping User Consent**.

4. Define a Multi-Resource Refresh Token policy for your Application. After your web application has been granted access to the My Account API, you will also need to leverage the [Multi-Resource Refresh Token](https://www.auth0.com/docs/manage-users/my-account-api#scope) feature, which enables the refresh token delivered to your application to also obtain an access token to call the My Account API. You can quickly define a [refresh token policy](https://auth0.com/docs/secure/tokens/refresh-tokens/multi-resource-refresh-token/configure-and-implement-multi-resource-refresh-token) for your application to use when requesting access tokens for the My Account API by doing the following:
   1. Navigate to **Applications** > **Applications** and select your client application.
   2. On the **Settings** tab, scroll down to the **Multi-Resource Refresh Token** section.
   3. Select **Edit Configuration** and then enable the **MRRT** toggle for the **Auth0 My Account API**.

5. Configure [Google Social Integration](https://auth0.com/ai/docs/integrations/google). Add any other [services](https://auth0.com/ai/docs/integrations/overview) similarly.

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
