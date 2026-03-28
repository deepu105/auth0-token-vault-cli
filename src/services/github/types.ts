export interface GitHubRepo {
  id: number;
  fullName: string;
  description: string;
  private: boolean;
  htmlUrl: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  defaultBranch: string;
  updatedAt: string;
}

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  htmlUrl: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  body: string | null;
  htmlUrl: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  pullRequest?: { htmlUrl: string };
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  user: GitHubUser;
  labels: GitHubLabel[];
  body: string | null;
  htmlUrl: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean | null;
  merged: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubComment {
  id: number;
  user: GitHubUser;
  body: string;
  htmlUrl: string;
  createdAt: string;
}

export interface GitHubNotification {
  id: string;
  unread: boolean;
  reason: string;
  subject: { title: string; type: string; url: string | null };
  repository: { fullName: string; htmlUrl: string };
  updatedAt: string;
}

export interface GitHubSearchResult<T> {
  totalCount: number;
  incompleteResults: boolean;
  items: T[];
}

export interface GitHubCodeSearchItem {
  name: string;
  path: string;
  htmlUrl: string;
  repository: { fullName: string };
}
