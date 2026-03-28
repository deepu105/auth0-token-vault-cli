---
title: "feat: Add GitHub service"
type: feat
status: active
date: 2026-03-28
---

# feat: Add GitHub service

## Overview

Add GitHub as a new service to auth0-tv, following the established pattern from Gmail, Calendar, and Slack. GitHub uses its own Auth0 connection (`github`) and covers repos, issues, PRs, notifications, and search.

## Problem Frame

The CLI currently supports Gmail, Calendar, and Slack. GitHub is listed as "coming soon" in the README. Users and agents need to interact with GitHub repos, issues, and PRs through the same auth0-tv pattern.

## Requirements Trace

- R1. Register GitHub in the service registry with `github` connection and appropriate OAuth scopes
- R2. Implement a GitHub API client using `@octokit/rest` (typed SDK, consistent with using official SDKs for each service)
- R3. Implement command groups: repos, issues, prs, notifications, search
- R4. Follow existing patterns: TokenGetter constructor, formatters, error mapping, MSW test mocks
- R5. Update docs (README, SKILL.md, commands.md) to include GitHub commands

## Scope Boundaries

- **In scope:** Repos (list, get), Issues (list, get, create, comment, close), PRs (list, get, comment), Notifications (list, mark-read), Search (repos, code, issues)
- **Out of scope:** GitHub Actions, Releases, Gists, Organizations, Webhooks, repo creation/deletion

## Key Technical Decisions

- **Client library: `@octokit/rest`** — Official GitHub SDK for Node.js, typed, follows the pattern of using vendor SDKs (googleapis for Google, @slack/web-api for Slack). Avoids hand-rolling REST calls.
- **Auth0 connection name: `github`** — Standard Auth0 social connection identifier for GitHub.
- **OAuth scopes: `repo`, `notifications`, `read:user`** — `repo` covers issues, PRs, and repo access. `notifications` for notification management. `read:user` for user profile info in search context.
- **Single client instance per call** — Same pattern as Slack: `new Octokit({ auth: await this.getToken() })` per API call since the token may change on refresh.

## Implementation Units

- [ ] **Unit 1: Service registry + dependency**

**Goal:** Register GitHub in the service registry and add the `@octokit/rest` dependency.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `src/utils/service-registry.ts`
- Modify: `package.json`
- Modify: `test/utils/service-registry.test.ts`

**Approach:**
- Add `github` entry with connection `github` and scopes `['repo', 'notifications', 'read:user']`
- `npm install @octokit/rest`
- Update service registry tests: entry lookup, connection mapping, available services count (3 → 4)

**Patterns to follow:** Existing `slack` entry in service-registry.ts

**Test scenarios:**
- `getServiceEntry('github')` returns correct connection and scopes
- `getAvailableServices()` includes `github`
- `getServicesForConnection('github')` returns `['github']`

**Verification:** Service registry tests pass with GitHub entry.

---

- [ ] **Unit 2: GitHub service client + types**

**Goal:** Create the GitHub API client with typed methods for all supported operations.

**Requirements:** R2, R4

**Dependencies:** Unit 1

**Files:**
- Create: `src/services/github/types.ts`
- Create: `src/services/github/client.ts`
- Create: `test/mocks/github/data.ts`
- Create: `test/mocks/github/handlers.ts`
- Create: `test/services/github/client.test.ts`

**Approach:**
- Types: `GitHubRepo`, `GitHubIssue`, `GitHubPullRequest`, `GitHubComment`, `GitHubNotification`, `GitHubSearchResult`
- Client class with `TokenGetter` constructor, private `api()` method creating `new Octokit({ auth })` per call
- Methods: `listRepos`, `getRepo`, `listIssues`, `getIssue`, `createIssue`, `commentOnIssue`, `closeIssue`, `listPullRequests`, `getPullRequest`, `commentOnPR`, `listNotifications`, `markNotificationRead`, `searchRepos`, `searchCode`, `searchIssues`
- MSW handlers mock GitHub REST API endpoints (`api.github.com`)

**Patterns to follow:** `src/services/slack/client.ts` (TokenGetter, per-call instance), `test/mocks/slack/` (MSW structure)

**Test scenarios:**
- Each client method calls the correct GitHub API endpoint
- List methods return typed arrays
- Create/comment methods return the created resource
- Error responses are propagated

**Verification:** All client tests pass with MSW mocks.

---

- [ ] **Unit 3: GitHub formatters**

**Goal:** Human-readable formatters for all GitHub resource types.

**Requirements:** R4

**Dependencies:** Unit 2 (types)

**Files:**
- Create: `src/services/github/formatters.ts`

**Approach:**
- `formatRepoList`, `formatRepo`, `formatIssueList`, `formatIssue`, `formatPRList`, `formatPR`, `formatCommentList`, `formatNotificationList`, `formatSearchResults`
- Use chalk for coloring (green for open, red for closed, yellow for draft PRs)

**Patterns to follow:** `src/services/slack/formatters.ts`, `src/services/calendar/formatters.ts`

**Verification:** Formatters compile and produce readable output for each resource type.

---

- [ ] **Unit 4: Command helpers + error mapping**

**Goal:** Create GitHub command helpers (client factory, error handler) and register the command group.

**Requirements:** R4

**Dependencies:** Unit 2

**Files:**
- Create: `src/commands/github/helpers.ts`
- Create: `src/commands/github/index.ts`
- Modify: `src/index.ts`
- Create: `test/commands/github/helpers.test.ts`

**Approach:**
- `CONNECTION = 'github'`, `createGitHubClient(cmd)`, `handleGitHubError(err, cmd)`
- Error mapping: 401 → EXIT_AUTH_REQUIRED, 403 → EXIT_AUTHZ_REQUIRED, 404 → EXIT_SERVICE_ERROR, network errors → EXIT_NETWORK_ERROR
- `createGitHubCommand()` registers all subcommands
- Register in `src/index.ts`

**Patterns to follow:** `src/commands/slack/helpers.ts`, `src/commands/slack/index.ts`

**Test scenarios:**
- `handleGitHubError` maps 401/403/404/network errors to correct exit codes
- Exports createGitHubClient

**Verification:** Helper tests pass, CLI `--help` shows `github` command group.

---

- [ ] **Unit 5: Repo commands**

**Goal:** Implement `github repos` and `github repo <owner/repo>`.

**Requirements:** R3

**Dependencies:** Unit 4

**Files:**
- Create: `src/commands/github/repos.ts`
- Create: `src/commands/github/repo.ts`

**Approach:**
- `repos` — list authenticated user's repos, flags: `--limit`, `--sort` (created/updated/pushed), `--type` (all/owner/member)
- `repo <owner/repo>` — get repo details by full name

**Patterns to follow:** `src/commands/slack/channels.ts` (list), `src/commands/calendar/get.ts` (single resource)

**Verification:** Commands registered, output works in both human and JSON modes.

---

- [ ] **Unit 6: Issue commands**

**Goal:** Implement issue CRUD: list, get, create, comment, close.

**Requirements:** R3

**Dependencies:** Unit 4

**Files:**
- Create: `src/commands/github/issues.ts`

**Approach:**
- `github issues <owner/repo>` — list issues, flags: `--state` (open/closed/all), `--limit`, `--labels`
- `github issue <owner/repo> <number>` — get issue details
- `github issue create <owner/repo>` — create issue (destructive), flags: `--title`, `--body`, `--labels`, `--assignees`
- `github issue comment <owner/repo> <number>` — add comment (destructive), flags: `--body`
- `github issue close <owner/repo> <number>` — close issue (destructive)

**Patterns to follow:** `src/commands/gmail/search.ts` (list), `src/commands/calendar/create.ts` (create with flags)

**Verification:** All issue subcommands registered and functional.

---

- [ ] **Unit 7: PR commands**

**Goal:** Implement PR read + comment: list, get, comment.

**Requirements:** R3

**Dependencies:** Unit 4

**Files:**
- Create: `src/commands/github/prs.ts`

**Approach:**
- `github prs <owner/repo>` — list PRs, flags: `--state` (open/closed/all), `--limit`
- `github pr <owner/repo> <number>` — get PR details (includes diff stats, review status)
- `github pr comment <owner/repo> <number>` — add comment (destructive), flags: `--body`

**Patterns to follow:** Same as issue commands

**Verification:** All PR subcommands registered and functional.

---

- [ ] **Unit 8: Notification commands**

**Goal:** Implement notification list and mark-read.

**Requirements:** R3

**Dependencies:** Unit 4

**Files:**
- Create: `src/commands/github/notifications.ts`

**Approach:**
- `github notifications` — list notifications, flags: `--all` (include read), `--limit`
- `github notification read <id>` — mark notification as read (destructive)

**Patterns to follow:** `src/commands/slack/messages.ts` (list with flags)

**Verification:** Notification commands registered and functional.

---

- [ ] **Unit 9: Search commands**

**Goal:** Implement GitHub search across repos, code, and issues.

**Requirements:** R3

**Dependencies:** Unit 4

**Files:**
- Create: `src/commands/github/search.ts`

**Approach:**
- `github search repos <query>` — search repositories, flags: `--limit`, `--sort` (stars/forks/updated)
- `github search code <query>` — search code, flags: `--limit`
- `github search issues <query>` — search issues/PRs, flags: `--limit`, `--sort` (created/updated/comments)

**Patterns to follow:** `src/commands/slack/search.ts`

**Verification:** All search subcommands registered and functional.

---

- [ ] **Unit 10: Documentation**

**Goal:** Update README, SKILL.md, and commands.md with GitHub commands.

**Requirements:** R5

**Dependencies:** Units 5-9

**Files:**
- Modify: `README.md`
- Modify: `skills/auth0-token-vault/SKILL.md`
- Modify: `skills/auth0-token-vault/references/commands.md`

**Approach:**
- Add GitHub to Available Services (remove "coming soon!")
- Add GitHub to Quick Start section
- Add full GitHub command reference with flags and examples
- Add GitHub to SKILL.md "When to use" and "Available commands"

**Patterns to follow:** Existing Calendar and Slack documentation sections

**Verification:** Documentation is complete and consistent with implemented commands.

## Risks & Dependencies

- **Auth0 GitHub connection configuration:** The user must have a `github` social connection configured in their Auth0 tenant. If the connection name differs, the service registry entry needs to match.
- **GitHub API rate limiting:** Unauthenticated: 60 req/hr, authenticated: 5000 req/hr. With Token Vault tokens we'll be authenticated, so rate limits are generous. No special handling needed.
- **`@octokit/rest` ESM compatibility:** Must verify the package works with our ESM setup. Octokit v20+ is ESM-native, so this should be fine.
