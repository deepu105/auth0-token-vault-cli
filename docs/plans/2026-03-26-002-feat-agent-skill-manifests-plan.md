---
title: 'feat: Add Agent Skills manifests for Claude Code and OpenClaw'
type: feat
status: completed
date: 2026-03-26
deepened: 2026-03-26
origin: docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md
---

# feat: Add Agent Skills manifests for Claude Code and OpenClaw

## Overview

Create skill definition files following the Agent Skills open standard (agentskills.io) so that Claude Code and OpenClaw can discover, gate, and invoke `auth0-tv` as a first-class skill. Add a small CLI enhancement (`AUTH0_TV_OUTPUT=json` env var) so agents don't need `--json` on every call.

## Problem Frame

The CLI was designed from day one for dual-mode (human + agent) consumption — `--json` output, semantic exit codes, `--confirm` flags, stdin body input. But there is no machine-readable skill manifest that agent frameworks can discover and use. This is explicitly listed as a README TODO: "Add skill.md for agent integration instructions and best practices."

Both Claude Code and OpenClaw implement the Agent Skills specification (agentskills.io, published December 2025). A single `SKILL.md` with platform-specific metadata extensions works across both systems.

## Requirements Trace

- R17. `--json` flag on all commands for structured agent output — already implemented, skill manifest documents this
- R18. `--confirm`/`--yes` for destructive actions in non-interactive mode — already implemented, skill manifest documents this
- R19. Consistent exit codes for agent error handling — already implemented, skill manifest documents this
- R20. `--help` on every command — already implemented, skill extracts this into reference doc
- NEW-S1. Agents can discover and invoke `auth0-tv` as a skill in Claude Code
- NEW-S2. Agents can discover and invoke `auth0-tv` as a skill in OpenClaw
- NEW-S3. `AUTH0_TV_OUTPUT=json` env var auto-enables JSON mode without `--json` flag

## Scope Boundaries

- **In scope:** SKILL.md, references/ directory with command documentation, `AUTH0_TV_OUTPUT` env var, tests for env var behavior
- **Not in scope:** MCP server wrapper, new CLI commands, changes to existing JSON output schemas, skill marketplace publishing, other agent systems beyond Claude Code and OpenClaw

## Context & Research

### Relevant Code and Patterns

- `src/utils/output.ts` — dual-mode output helper that checks `--json` flag via `isJsonMode()`; this is where `AUTH0_TV_OUTPUT` support goes
- `src/utils/exit-codes.ts` — exit code constants (0-6)
- `src/index.ts` — global `--json`, `--confirm`, `--yes` options
- `src/commands/gmail/helpers.ts` — `requireConfirmation()`, `handleGmailError()`, `resolveBody()`
- `README.md` — existing "Agent Integration" section with JSON mode, destructive actions, exit codes, body input docs

### External References

- [Agent Skills Specification](https://agentskills.io/specification) — the open standard both Claude Code and OpenClaw implement
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) — Claude Code-specific extensions (`allowed-tools`, dynamic context injection via `` !`cmd` ``, `context: fork`)
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills) — OpenClaw-specific extensions (`metadata.openclaw` for binary gating, install specs, env requirements)
- [OpenClaw xurl skill](https://github.com/openclaw/openclaw/blob/main/skills/xurl/SKILL.md) — real-world example of wrapping a CLI as an OpenClaw skill

## Key Technical Decisions

- **Single SKILL.md for both platforms:** The Agent Skills standard allows platform-specific extensions in `metadata.*` namespaces. Claude Code reads `allowed-tools` and the markdown body; OpenClaw reads `metadata.openclaw` for gating/install. Each platform ignores unknown metadata keys. One file, two consumers.

- **Skill location: dual-path for cross-platform discovery.** Claude Code discovers skills from `.claude/skills/<name>/SKILL.md`; OpenClaw discovers from `<workspace>/skills/<name>/SKILL.md` or `~/.openclaw/skills/`. These are different paths. Ship the canonical skill in `.claude/skills/auth0-token-vault/` (Claude Code native discovery) and add a symlink at `skills/auth0-token-vault/SKILL.md` pointing to `../../.claude/skills/auth0-token-vault/SKILL.md` for OpenClaw workspace-level discovery. This avoids duplicating the file while ensuring both platforms find it automatically when working in the project directory. For global (non-workspace) use, the README will document copying to `~/.claude/skills/` or `~/.openclaw/skills/`.

- **Dynamic context injection for status:** Use Claude Code's `` !`auth0-tv --json status` `` syntax to inject current auth/connection status into the skill context at activation time. This lets the agent know immediately whether login/connect is needed before attempting service commands.

- **`AUTH0_TV_OUTPUT=json` env var:** Agent environments can set this once rather than passing `--json` on every invocation. This follows the pattern of tools like `GH_FORMAT` in GitHub CLI. The env var is checked in `isJsonMode()` — a two-line change.

- **References directory for command docs:** Keep SKILL.md under 500 lines (per spec recommendation). Move the full command reference to `references/commands.md`. This follows the Agent Skills progressive disclosure model: metadata (~100 tokens) -> instructions (<5000 tokens) -> resources (as needed).

## Open Questions

### Resolved During Planning

- **Where to place the skill directory?** Resolved: `.claude/skills/auth0-token-vault/` in the project repo. This is the standard project-level location for Claude Code and is compatible with copying to OpenClaw's `~/.openclaw/skills/` directory.

- **Should SKILL.md include full command reference inline?** Resolved: No. Keep SKILL.md focused on patterns and error handling. Full command reference goes in `references/commands.md` to stay under the 500-line recommendation.

- **How to handle the auth prerequisite (login requires a browser)?** Resolved: Document in the skill that `login` and `connect` are human-in-the-loop commands. The skill should instruct the agent to tell the user to run these manually when exit code 3 or 4 is encountered, rather than attempting them autonomously.

- **Should OpenClaw `requires.env` gate on Auth0 env vars?** Resolved: No. The CLI resolves config from both env vars AND credential store (`~/.auth0-tv/credentials.json` or OS keychain). Users who ran `auth0-tv login` interactively will have config in the credential store without any env vars set. Using `requires.env: [AUTH0_DOMAIN, AUTH0_CLIENT_ID]` would falsely block these users. Instead, omit `requires.env` from the OpenClaw metadata and let the CLI's own error handling (exit code 3) guide the agent. Only `requires.bins: [auth0-tv]` is safe as a gate.

### Deferred to Implementation

- Exact wording of skill description (needs to be <=1024 chars and optimized for agent matching heuristics)
- Whether to add `user-invocable: false` or leave the skill as auto-triggerable

## Implementation Units

- [ ] **Unit 1: Add `AUTH0_TV_OUTPUT` env var support**

  **Goal:** Let agent environments set `AUTH0_TV_OUTPUT=json` to auto-enable JSON mode without `--json` flag on every call.

  **Requirements:** NEW-S3

  **Dependencies:** None

  **Files:**
  - Modify: `src/utils/output.ts`
  - Test: `test/utils/output.test.ts`

  **Approach:**
  - In `isJsonMode()`, check `process.env.AUTH0_TV_OUTPUT === 'json'` as a fallback when the `--json` flag is not set
  - Precedence: `--json` flag > `AUTH0_TV_OUTPUT` env var > default (human mode)
  - Document the env var in the skill and README

  **Patterns to follow:**
  - Existing `resolveStorageBackend()` in `src/utils/config.ts` shows the pattern for env var resolution with validation

  **Test scenarios:**
  - `AUTH0_TV_OUTPUT=json` produces JSON output without `--json` flag
  - `--json` flag still works regardless of env var
  - Invalid `AUTH0_TV_OUTPUT` value (e.g., `xml`) is ignored (falls back to human mode)
  - No env var and no flag produces human output (existing behavior preserved)

  **Verification:**
  - All existing tests still pass
  - New tests cover the env var behavior

- [ ] **Unit 2: Create SKILL.md with Agent Skills standard frontmatter**

  **Goal:** Create the primary skill definition file that both Claude Code and OpenClaw can discover and consume.

  **Requirements:** NEW-S1, NEW-S2

  **Dependencies:** Unit 1 (to document `AUTH0_TV_OUTPUT`)

  **Files:**
  - Create: `.claude/skills/auth0-token-vault/SKILL.md`
  - Create: `skills/auth0-token-vault/SKILL.md` (symlink to `../../.claude/skills/auth0-token-vault/SKILL.md`)

  **Approach:**
  - Frontmatter includes standard fields (`name`, `description`, `compatibility`, `license`, `allowed-tools`) plus platform extensions
  - `allowed-tools: Bash(auth0-tv *)` pre-approves all `auth0-tv` commands in Claude Code
  - `metadata.openclaw` section includes `requires.bins: [auth0-tv]` and npm install spec. **Do not** include `requires.env` — the CLI resolves config from credential store as well as env vars, so env gating would produce false negatives for users who logged in interactively
  - Dynamic context injection: `` !`auth0-tv --json status 2>/dev/null || echo '{"error":{"code":"not_configured","message":"auth0-tv not configured"}}'` `` to show current auth state at activation (Claude Code-specific; OpenClaw agents will run `auth0-tv --json status` themselves)
  - Body content covers: when to use, key patterns (always `--json`, `--confirm` for destructive ops), exit code table with recovery actions, auth prerequisite (tell user to run `login`/`connect` manually), available command groups, pointer to `references/commands.md`
  - Create symlink at `skills/auth0-token-vault/SKILL.md` pointing to `../../.claude/skills/auth0-token-vault/SKILL.md` for OpenClaw workspace-level discovery
  - Keep under 500 lines total

  **Patterns to follow:**
  - OpenClaw's xurl skill structure (simple CLI wrapper with binary gating and install spec)
  - Claude Code's skill documentation examples (dynamic context injection, allowed-tools)

  **Test scenarios:**
  - SKILL.md frontmatter is valid YAML (parseable by any YAML parser)
  - `name` field matches directory name (`auth0-token-vault`)
  - `description` is <=1024 characters
  - Total file is <500 lines
  - Symlink at `skills/auth0-token-vault/SKILL.md` resolves to the canonical file
  - `metadata.openclaw` does NOT include `requires.env` (to avoid false gating)

  **Verification:**
  - SKILL.md is parseable and follows the Agent Skills spec structure
  - Claude Code discovers the skill via `.claude/skills/` when working in this repo
  - OpenClaw discovers the skill via `skills/` symlink when working in this repo
  - OpenClaw metadata includes valid binary gating and install spec but no env gating

- [ ] **Unit 3: Create references/commands.md with full command documentation**

  **Goal:** Provide comprehensive command reference for agents that need detailed invocation patterns, extracted from README and `--help` output.

  **Requirements:** R20, NEW-S1, NEW-S2

  **Dependencies:** Unit 2

  **Files:**
  - Create: `.claude/skills/auth0-token-vault/references/commands.md`

  **Approach:**
  - Organize by command group: Authentication, Gmail, Connection Management
  - For each command: synopsis, flags, JSON output schema example, exit codes it can produce
  - Include example invocations with `--json --confirm` flags
  - Document body input options (--body, --body-file, stdin) for send/reply/draft
  - Document pagination (--max-results, --page-token) for search
  - Source content from README "Commands" section and actual `--help` output

  **Patterns to follow:**
  - README.md "Commands" section structure
  - Agent Skills spec progressive disclosure model (this is the "resources" tier)

  **Test scenarios:**
  - All commands documented in README are present in references
  - JSON output examples are valid JSON
  - No raw token values in examples

  **Verification:**
  - Commands reference covers all current CLI commands
  - Examples use `--json` mode consistently

- [ ] **Unit 4: Update README and CLAUDE.md**

  **Goal:** Update project documentation to reference the skill, remove the TODO item, and document `AUTH0_TV_OUTPUT` env var.

  **Requirements:** NEW-S1, NEW-S2, NEW-S3

  **Dependencies:** Units 1-3

  **Files:**
  - Modify: `README.md`
  - Modify: `CLAUDE.md`

  **Approach:**
  - README: Remove the "Add skill.md" TODO item. Add a new "Agent Skills" section (or expand "Agent Integration") that explains the skill, how to install it for Claude Code and OpenClaw, and documents both in-project discovery (automatic via `.claude/skills/` and `skills/` symlink) and global installation (copy to `~/.claude/skills/` or `~/.openclaw/skills/`). Document `AUTH0_TV_OUTPUT=json` env var in the Environment Variables table. Note that global `npm install -g` is required for agent use (not `npx`).
  - CLAUDE.md: Add a brief note about the skill definition location and the `AUTH0_TV_OUTPUT` env var

  **Patterns to follow:**
  - README's existing "Agent Integration" section structure
  - CLAUDE.md's existing concise style

  **Test scenarios:**
  - README TODO list no longer mentions skill.md
  - README documents both Claude Code and OpenClaw installation paths
  - `AUTH0_TV_OUTPUT` appears in the Environment Variables table

  **Verification:**
  - Documentation is consistent with the actual skill files
  - No stale TODO references

## System-Wide Impact

- **Interaction graph:** The only code change is in `isJsonMode()` (`src/utils/output.ts`), which is called by every command's output path. The env var adds a fallback check — existing `--json` flag behavior is unchanged.
- **Error propagation:** No changes to error handling. The skill documents existing error behavior for agent consumers.
- **State lifecycle risks:** None. Skill files are static documentation; the env var is a read-only check.
- **API surface parity:** The `AUTH0_TV_OUTPUT` env var introduces a new public contract. It should be treated as stable once shipped.

## Risks & Dependencies

- **Agent Skills spec stability:** The agentskills.io spec was published December 2025 and has broad adoption (30+ agent products). Risk of breaking changes is low, but the skill should be kept minimal to reduce surface area.
- **Dynamic context injection portability:** The `` !`command` `` syntax is Claude Code-specific. OpenClaw does not execute dynamic commands in SKILL.md. This is acceptable — OpenClaw agents will discover auth state by running `auth0-tv --json status` themselves. The skill body instructions work for both platforms since they describe CLI invocation patterns, not platform-specific APIs.
- **`auth0-tv` must be on PATH:** Both platforms gate on binary availability via `requires.bins`. Users running `npx auth0-tv` or using a project-local install (`node_modules/.bin/auth0-tv`) won't have the binary on their global PATH, causing the gate to fail silently. Mitigation: the skill's OpenClaw install spec provides `npm install -g` as the recommended installation method. The README should also document that global installation is required for agent discovery. The `npx` path is intentionally unsupported for agent use since agents need predictable binary resolution.
- **`allowed-tools` pattern locks in binary name:** Claude Code's `allowed-tools: Bash(auth0-tv *)` pre-approves commands matching the `auth0-tv` prefix. If the binary name ever changes, the skill must be updated. This is low-risk since `auth0-tv` is the published npm bin name and is unlikely to change.
- **Symlink portability:** The `skills/` symlink for OpenClaw discovery assumes the platform supports symlinks. Windows without Developer Mode enabled does not support symlinks reliably. This is acceptable since the plan targets Linux/macOS (matching `metadata.openclaw.os`). The README should note that Windows users may need to copy instead of symlink.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md](../brainstorms/2026-03-25-auth0-token-vault-cli-requirements.md)
- Related code: `src/utils/output.ts`, `src/utils/exit-codes.ts`, `src/commands/gmail/helpers.ts`
- External docs: [agentskills.io/specification](https://agentskills.io/specification), [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills), [docs.openclaw.ai/tools/skills](https://docs.openclaw.ai/tools/skills)
