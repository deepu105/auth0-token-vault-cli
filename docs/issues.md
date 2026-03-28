# Known Issues

## Slack: `invalid_team_for_non_distributed_app` on connect

**Status:** Open

**Symptom:** Running `auth0-tv connect slack` fails with `invalid_team_for_non_distributed_app` during the OAuth flow.

**Cause:** The Slack app behind the Auth0 `sign-in-with-slack` connection is not marked as distributed. Slack rejects OAuth authorization from workspaces other than where the app was originally installed.

**Fix options:**

1. In the Slack API dashboard for the app used by your Auth0 connection:
   - Go to **Settings → Manage Distribution**
   - Complete any pending checklist items
   - Click **Activate Public Distribution**
   - The app does not need to be listed in the Slack App Directory — activating distribution is sufficient for OAuth to work.

2. If using Auth0's built-in `sign-in-with-slack` connection, you may need to create a custom Slack social connection in Auth0 with your own Slack app that has distribution enabled, then update the service registry connection name to match.
