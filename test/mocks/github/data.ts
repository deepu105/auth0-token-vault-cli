/** Minimal GitHub API response fixtures */

export const mockRepoList = [
  {
    id: 1,
    full_name: 'user/repo-one',
    description: 'First repository',
    private: false,
    html_url: 'https://github.com/user/repo-one',
    language: 'TypeScript',
    stargazers_count: 42,
    forks_count: 5,
    open_issues_count: 3,
    default_branch: 'main',
    updated_at: '2026-03-28T00:00:00Z',
  },
  {
    id: 2,
    full_name: 'user/repo-two',
    description: 'Second repository',
    private: true,
    html_url: 'https://github.com/user/repo-two',
    language: 'Python',
    stargazers_count: 10,
    forks_count: 1,
    open_issues_count: 0,
    default_branch: 'main',
    updated_at: '2026-03-27T00:00:00Z',
  },
];

export const mockRepo = mockRepoList[0];

export const mockIssueList = [
  {
    number: 1,
    title: 'Bug: login fails',
    state: 'open',
    user: { login: 'alice', id: 100, html_url: 'https://github.com/alice' },
    labels: [{ name: 'bug', color: 'd73a4a' }],
    assignees: [{ login: 'bob', id: 101, html_url: 'https://github.com/bob' }],
    body: 'Login fails with a 500 error',
    html_url: 'https://github.com/user/repo-one/issues/1',
    comments: 2,
    created_at: '2026-03-25T10:00:00Z',
    updated_at: '2026-03-27T14:00:00Z',
    closed_at: null,
  },
  {
    number: 2,
    title: 'Feature: dark mode',
    state: 'open',
    user: { login: 'bob', id: 101, html_url: 'https://github.com/bob' },
    labels: [{ name: 'enhancement', color: 'a2eeef' }],
    assignees: [],
    body: 'Add dark mode support',
    html_url: 'https://github.com/user/repo-one/issues/2',
    comments: 0,
    created_at: '2026-03-26T12:00:00Z',
    updated_at: '2026-03-26T12:00:00Z',
    closed_at: null,
  },
];

export const mockIssue = mockIssueList[0];

export const mockCreatedIssue = {
  ...mockIssueList[0],
  number: 3,
  title: 'New issue',
  body: 'Issue body',
  html_url: 'https://github.com/user/repo-one/issues/3',
};

export const mockComment = {
  id: 1001,
  user: { login: 'alice', id: 100, html_url: 'https://github.com/alice' },
  body: 'This is a comment',
  html_url: 'https://github.com/user/repo-one/issues/1#issuecomment-1001',
  created_at: '2026-03-28T10:00:00Z',
};

export const mockPRList = [
  {
    number: 10,
    title: 'feat: add dark mode',
    state: 'open',
    draft: false,
    user: { login: 'bob', id: 101, html_url: 'https://github.com/bob' },
    labels: [{ name: 'feature', color: '0075ca' }],
    body: 'Adds dark mode support',
    html_url: 'https://github.com/user/repo-one/pull/10',
    additions: 150,
    deletions: 20,
    changed_files: 8,
    mergeable: true,
    merged: false,
    created_at: '2026-03-27T09:00:00Z',
    updated_at: '2026-03-28T08:00:00Z',
  },
];

export const mockPR = mockPRList[0];

export const mockNotificationList = [
  {
    id: '5001',
    unread: true,
    reason: 'mention',
    subject: {
      title: 'Bug: login fails',
      type: 'Issue',
      url: 'https://api.github.com/repos/user/repo-one/issues/1',
    },
    repository: {
      full_name: 'user/repo-one',
      html_url: 'https://github.com/user/repo-one',
    },
    updated_at: '2026-03-28T12:00:00Z',
  },
  {
    id: '5002',
    unread: true,
    reason: 'review_requested',
    subject: {
      title: 'feat: add dark mode',
      type: 'PullRequest',
      url: 'https://api.github.com/repos/user/repo-one/pulls/10',
    },
    repository: {
      full_name: 'user/repo-one',
      html_url: 'https://github.com/user/repo-one',
    },
    updated_at: '2026-03-28T11:00:00Z',
  },
];

export const mockSearchRepos = {
  total_count: 1,
  incomplete_results: false,
  items: [mockRepoList[0]],
};

export const mockSearchCode = {
  total_count: 1,
  incomplete_results: false,
  items: [
    {
      name: 'index.ts',
      path: 'src/index.ts',
      html_url: 'https://github.com/user/repo-one/blob/main/src/index.ts',
      repository: { full_name: 'user/repo-one' },
    },
  ],
};

export const mockSearchIssues = {
  total_count: 1,
  incomplete_results: false,
  items: [mockIssueList[0]],
};
