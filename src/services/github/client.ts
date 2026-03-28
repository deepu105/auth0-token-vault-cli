import { Octokit } from '@octokit/rest';
import type {
  GitHubRepo,
  GitHubIssue,
  GitHubPullRequest,
  GitHubComment,
  GitHubNotification,
  GitHubSearchResult,
  GitHubCodeSearchItem,
} from './types.js';

type TokenGetter = () => Promise<string>;

function parseUser(u: any) {
  return { login: u.login ?? '', id: u.id ?? 0, htmlUrl: u.html_url ?? '' };
}

function parseLabels(labels: any[]): { name: string; color: string }[] {
  return labels.map((l: any) => ({
    name: typeof l === 'string' ? l : (l.name ?? ''),
    color: typeof l === 'string' ? '' : (l.color ?? ''),
  }));
}

export class GitHubClient {
  private readonly getToken: TokenGetter;

  constructor(getToken: TokenGetter) {
    this.getToken = getToken;
  }

  /** Create a new Octokit per call since the token may change on refresh. */
  private async api(): Promise<Octokit> {
    return new Octokit({ auth: await this.getToken() });
  }

  // ── Repos ──────────────────────────────────────────────────────

  async listRepos(opts?: {
    perPage?: number;
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    type?: 'all' | 'owner' | 'member';
  }): Promise<GitHubRepo[]> {
    const api = await this.api();
    const { data } = await api.repos.listForAuthenticatedUser({
      per_page: opts?.perPage ?? 30,
      sort: opts?.sort ?? 'updated',
      type: opts?.type ?? 'owner',
    });
    return data.map(parseRepo);
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    const api = await this.api();
    const { data } = await api.repos.get({ owner, repo });
    return parseRepo(data);
  }

  // ── Issues ─────────────────────────────────────────────────────

  async listIssues(
    owner: string,
    repo: string,
    opts?: { state?: 'open' | 'closed' | 'all'; perPage?: number; labels?: string }
  ): Promise<GitHubIssue[]> {
    const api = await this.api();
    const { data } = await api.issues.listForRepo({
      owner,
      repo,
      state: opts?.state ?? 'open',
      per_page: opts?.perPage ?? 30,
      labels: opts?.labels,
    });
    return data.map(parseIssue);
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const api = await this.api();
    const { data } = await api.issues.get({ owner, repo, issue_number: issueNumber });
    return parseIssue(data);
  }

  async createIssue(
    owner: string,
    repo: string,
    opts: { title: string; body?: string; labels?: string[]; assignees?: string[] }
  ): Promise<GitHubIssue> {
    const api = await this.api();
    const { data } = await api.issues.create({ owner, repo, ...opts });
    return parseIssue(data);
  }

  async commentOnIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<GitHubComment> {
    const api = await this.api();
    const { data } = await api.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    return parseComment(data);
  }

  async closeIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const api = await this.api();
    const { data } = await api.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: 'closed',
    });
    return parseIssue(data);
  }

  // ── Pull Requests ──────────────────────────────────────────────

  async listPullRequests(
    owner: string,
    repo: string,
    opts?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
  ): Promise<GitHubPullRequest[]> {
    const api = await this.api();
    const { data } = await api.pulls.list({
      owner,
      repo,
      state: opts?.state ?? 'open',
      per_page: opts?.perPage ?? 30,
    });
    return data.map(parsePR);
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubPullRequest> {
    const api = await this.api();
    const { data } = await api.pulls.get({ owner, repo, pull_number: pullNumber });
    return parsePR(data);
  }

  async commentOnPR(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string
  ): Promise<GitHubComment> {
    // PR comments use the issues API
    const api = await this.api();
    const { data } = await api.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
    return parseComment(data);
  }

  // ── Notifications ──────────────────────────────────────────────

  async listNotifications(opts?: {
    all?: boolean;
    perPage?: number;
  }): Promise<GitHubNotification[]> {
    const api = await this.api();
    const { data } = await api.activity.listNotificationsForAuthenticatedUser({
      all: opts?.all ?? false,
      per_page: opts?.perPage ?? 30,
    });
    return data.map(parseNotification);
  }

  async markNotificationRead(threadId: string): Promise<void> {
    const api = await this.api();
    await api.activity.markThreadAsRead({ thread_id: Number(threadId) });
  }

  // ── Search ─────────────────────────────────────────────────────

  async searchRepos(
    query: string,
    opts?: { perPage?: number; sort?: 'stars' | 'forks' | 'updated' }
  ): Promise<GitHubSearchResult<GitHubRepo>> {
    const api = await this.api();
    const { data } = await api.search.repos({
      q: query,
      per_page: opts?.perPage ?? 20,
      sort: opts?.sort,
    });
    return {
      totalCount: data.total_count,
      incompleteResults: data.incomplete_results,
      items: data.items.map(parseRepo),
    };
  }

  async searchCode(
    query: string,
    opts?: { perPage?: number }
  ): Promise<GitHubSearchResult<GitHubCodeSearchItem>> {
    const api = await this.api();
    const { data } = await api.search.code({
      q: query,
      per_page: opts?.perPage ?? 20,
    });
    return {
      totalCount: data.total_count,
      incompleteResults: data.incomplete_results,
      items: data.items.map((item) => ({
        name: item.name,
        path: item.path,
        htmlUrl: item.html_url,
        repository: { fullName: item.repository.full_name },
      })),
    };
  }

  async searchIssues(
    query: string,
    opts?: { perPage?: number; sort?: 'created' | 'updated' | 'comments' }
  ): Promise<GitHubSearchResult<GitHubIssue>> {
    const api = await this.api();
    const { data } = await api.search.issuesAndPullRequests({
      q: query,
      per_page: opts?.perPage ?? 20,
      sort: opts?.sort,
    });
    return {
      totalCount: data.total_count,
      incompleteResults: data.incomplete_results,
      items: data.items.map(parseIssue),
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseRepo(r: any): GitHubRepo {
  return {
    id: r.id,
    fullName: r.full_name,
    description: r.description ?? '',
    private: r.private ?? false,
    htmlUrl: r.html_url,
    language: r.language ?? null,
    stargazersCount: r.stargazers_count ?? 0,
    forksCount: r.forks_count ?? 0,
    openIssuesCount: r.open_issues_count ?? 0,
    defaultBranch: r.default_branch ?? 'main',
    updatedAt: r.updated_at ?? '',
  };
}

function parseIssue(i: any): GitHubIssue {
  return {
    number: i.number,
    title: i.title,
    state: i.state ?? 'open',
    user: parseUser(i.user ?? {}),
    labels: parseLabels(i.labels ?? []),
    assignees: (i.assignees ?? []).map(parseUser),
    body: i.body ?? null,
    htmlUrl: i.html_url ?? '',
    comments: i.comments ?? 0,
    createdAt: i.created_at ?? '',
    updatedAt: i.updated_at ?? '',
    closedAt: i.closed_at ?? null,
    pullRequest: i.pull_request ? { htmlUrl: i.pull_request.html_url } : undefined,
  };
}

function parsePR(p: any): GitHubPullRequest {
  return {
    number: p.number,
    title: p.title,
    state: p.state ?? 'open',
    draft: p.draft ?? false,
    user: parseUser(p.user ?? {}),
    labels: parseLabels(p.labels ?? []),
    body: p.body ?? null,
    htmlUrl: p.html_url ?? '',
    additions: p.additions ?? 0,
    deletions: p.deletions ?? 0,
    changedFiles: p.changed_files ?? 0,
    mergeable: p.mergeable ?? null,
    merged: p.merged ?? false,
    createdAt: p.created_at ?? '',
    updatedAt: p.updated_at ?? '',
  };
}

function parseComment(c: any): GitHubComment {
  return {
    id: c.id,
    user: parseUser(c.user ?? {}),
    body: c.body ?? '',
    htmlUrl: c.html_url ?? '',
    createdAt: c.created_at ?? '',
  };
}

function parseNotification(n: any): GitHubNotification {
  return {
    id: n.id,
    unread: n.unread ?? false,
    reason: n.reason ?? '',
    subject: {
      title: n.subject?.title ?? '',
      type: n.subject?.type ?? '',
      url: n.subject?.url ?? null,
    },
    repository: {
      fullName: n.repository?.full_name ?? '',
      htmlUrl: n.repository?.html_url ?? '',
    },
    updatedAt: n.updated_at ?? '',
  };
}
