import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { githubHandlers } from '../../mocks/github/handlers.js';
import { GitHubClient } from '../../../src/services/github/client.js';

describe('GitHubClient', () => {
  const msw = setupServer(...githubHandlers);
  let client: GitHubClient;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => msw.resetHandlers());

  beforeAll(() => {
    client = new GitHubClient(async () => 'mock-github-token');
  });

  // ── Repos ──────────────────────────────────────────────────────

  it('listRepos returns repo list', async () => {
    const repos = await client.listRepos();
    expect(repos).toHaveLength(2);
    expect(repos[0].fullName).toBe('user/repo-one');
    expect(repos[0].language).toBe('TypeScript');
    expect(repos[0].stargazersCount).toBe(42);
    expect(repos[1].private).toBe(true);
  });

  it('getRepo returns repo details', async () => {
    const repo = await client.getRepo('user', 'repo-one');
    expect(repo.fullName).toBe('user/repo-one');
    expect(repo.description).toBe('First repository');
  });

  // ── Issues ─────────────────────────────────────────────────────

  it('listIssues returns issue list', async () => {
    const issues = await client.listIssues('user', 'repo-one');
    expect(issues).toHaveLength(2);
    expect(issues[0].title).toBe('Bug: login fails');
    expect(issues[0].user.login).toBe('alice');
    expect(issues[0].labels[0].name).toBe('bug');
  });

  it('getIssue returns issue details', async () => {
    const issue = await client.getIssue('user', 'repo-one', 1);
    expect(issue.number).toBe(1);
    expect(issue.body).toBe('Login fails with a 500 error');
  });

  it('createIssue returns created issue', async () => {
    const issue = await client.createIssue('user', 'repo-one', {
      title: 'New issue',
      body: 'Issue body',
    });
    expect(issue.number).toBe(3);
    expect(issue.title).toBe('New issue');
  });

  it('commentOnIssue returns created comment', async () => {
    const comment = await client.commentOnIssue('user', 'repo-one', 1, 'This is a comment');
    expect(comment.id).toBe(1001);
    expect(comment.body).toBe('This is a comment');
  });

  it('closeIssue returns closed issue', async () => {
    const issue = await client.closeIssue('user', 'repo-one', 1);
    expect(issue.state).toBe('closed');
  });

  // ── Pull Requests ──────────────────────────────────────────────

  it('listPullRequests returns PR list', async () => {
    const prs = await client.listPullRequests('user', 'repo-one');
    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe('feat: add dark mode');
    expect(prs[0].additions).toBe(150);
    expect(prs[0].deletions).toBe(20);
  });

  it('getPullRequest returns PR details', async () => {
    const pr = await client.getPullRequest('user', 'repo-one', 10);
    expect(pr.number).toBe(10);
    expect(pr.draft).toBe(false);
    expect(pr.changedFiles).toBe(8);
  });

  // ── Notifications ──────────────────────────────────────────────

  it('listNotifications returns notification list', async () => {
    const notifications = await client.listNotifications();
    expect(notifications).toHaveLength(2);
    expect(notifications[0].subject.title).toBe('Bug: login fails');
    expect(notifications[0].reason).toBe('mention');
    expect(notifications[1].subject.type).toBe('PullRequest');
  });

  it('markNotificationRead completes without error', async () => {
    await expect(client.markNotificationRead('5001')).resolves.toBeUndefined();
  });

  // ── Search ─────────────────────────────────────────────────────

  it('searchRepos returns search results', async () => {
    const result = await client.searchRepos('typescript');
    expect(result.totalCount).toBe(1);
    expect(result.items[0].fullName).toBe('user/repo-one');
  });

  it('searchCode returns code results', async () => {
    const result = await client.searchCode('import');
    expect(result.totalCount).toBe(1);
    expect(result.items[0].path).toBe('src/index.ts');
  });

  it('searchIssues returns issue results', async () => {
    const result = await client.searchIssues('bug');
    expect(result.totalCount).toBe(1);
    expect(result.items[0].title).toBe('Bug: login fails');
  });

  // ── Token getter ───────────────────────────────────────────────

  it('calls token getter before each operation', async () => {
    const tokenFn = vi.fn(async () => 'fresh-token');
    const freshClient = new GitHubClient(tokenFn);
    await freshClient.listRepos();
    expect(tokenFn).toHaveBeenCalledOnce();

    await freshClient.listRepos();
    expect(tokenFn).toHaveBeenCalledTimes(2);
  });
});
