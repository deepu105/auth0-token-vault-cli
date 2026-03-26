# Testing auth0-tv as an Agent Skill

## Prerequisites

Make `auth0-tv` available on PATH:

```bash
# Option A: Link locally from this repo
npm link

# Option B: Or add local bin to PATH for testing
export PATH="$PWD/node_modules/.bin:$PATH"
```

Verify it works:

```bash
auth0-tv login #login via the opened browser flow. Pass --browser flag if needed
auth0-tv --json status
```

## OpenClaw

OpenClaw discovers skills from `~/.openclaw/skills/`. Copy the skill there:

```bash
# Copy the skills
cp -r skills/auth0-token-vault ~/.openclaw/skills/

# If you have workspace sandbox enabled, copy the skill into the sandbox's `<workspace>/skills/` instead. For example, if your workspace is at `~/openclaw/workspace`
cp -r skills/auth0-token-vault ~/openclaw/workspace/skills/auth0-token-vault
```

OpenClaw rejects symlinks that resolve outside `~/.openclaw/` — a physical copy is required. During development, re-run the copy command after editing skill files to pick up changes.

### Enable the skill

Managed skills (user-installed, not bundled) must be explicitly enabled in `~/.openclaw/openclaw.json`. Add the skill under `skills.entries`:

```json
{
  "skills": {
    "entries": {
      "auth0-token-vault": {
        "enabled": true
      }
    }
  }
}
```

Or run:

```bash
python3 -c "
import json, pathlib
p = pathlib.Path.home() / '.openclaw/openclaw.json'
d = json.loads(p.read_text())
d.setdefault('skills', {}).setdefault('entries', {})['auth0-token-vault'] = {'enabled': True}
p.write_text(json.dumps(d, indent=2))
"
```

### Verify discovery

```bash
openclaw skills list
```

You should see `auth0-token-vault` with `✓ ready` status. If it shows as "gated", make sure `auth0-tv` is on PATH and `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` are set (OpenClaw checks `requires.bins` and `requires.env`).

### Test invocation

Start a **new** OpenClaw session (skills are loaded at session start, not hot-reloaded) and ask it to interact with Gmail:

> "Search my Gmail for emails from boss@company.com"

## Claude Code

The skill is at `.claude/skills/auth0-token-vault/SKILL.md` (symlink to `skills/auth0-token-vault/`). Claude Code auto-discovers project-level skills.

### Verify discovery

Open a new Claude Code session in this repo directory:

```bash
cd /mnt/work/Workspace/okta/gen-ai/auth0-token-vault-cli
claude
```

Type `/` — you should see `auth0-token-vault` in the skill list. You can invoke it directly:

```
/auth0-token-vault search emails from boss@company.com
```

### Test auto-triggering

Start a new Claude Code session and ask:

> "Search my Gmail for emails from boss@company.com"

Claude should recognize this matches the skill description and invoke `auth0-tv --json gmail search "from:boss@company.com"`.

### Test error recovery

Without logging in first, ask Claude to search email. It should get exit code 3 and tell you to run `auth0-tv login`.

## Quick Smoke Test (both platforms)

Before testing in agents, verify the CLI itself works in JSON mode:

```bash
# Should return structured JSON (even without login, tests error output)
auth0-tv --json status

# Test the AUTH0_TV_OUTPUT env var
AUTH0_TV_OUTPUT=json auth0-tv status
```

## Cleanup

```bash
# Remove OpenClaw skill and config entry
rm -rf ~/.openclaw/skills/auth0-token-vault

# Remove npm link
npm unlink -g
```
