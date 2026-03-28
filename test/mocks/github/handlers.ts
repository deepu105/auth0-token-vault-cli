import { http, HttpResponse } from 'msw';
import {
  mockRepoList,
  mockRepo,
  mockIssueList,
  mockIssue,
  mockCreatedIssue,
  mockComment,
  mockPRList,
  mockPR,
  mockNotificationList,
  mockSearchRepos,
  mockSearchCode,
  mockSearchIssues,
} from './data.js';

const BASE = 'https://api.github.com';

export const githubHandlers = [
  // Repos
  http.get(`${BASE}/user/repos`, () => HttpResponse.json(mockRepoList)),
  http.get(`${BASE}/repos/:owner/:repo`, () => HttpResponse.json(mockRepo)),

  // Issues
  http.get(`${BASE}/repos/:owner/:repo/issues`, () => HttpResponse.json(mockIssueList)),
  http.get(`${BASE}/repos/:owner/:repo/issues/:number`, () => HttpResponse.json(mockIssue)),
  http.post(`${BASE}/repos/:owner/:repo/issues`, () =>
    HttpResponse.json(mockCreatedIssue, { status: 201 })
  ),
  http.post(`${BASE}/repos/:owner/:repo/issues/:number/comments`, () =>
    HttpResponse.json(mockComment, { status: 201 })
  ),
  http.patch(`${BASE}/repos/:owner/:repo/issues/:number`, () =>
    HttpResponse.json({ ...mockIssue, state: 'closed' })
  ),

  // Pull Requests
  http.get(`${BASE}/repos/:owner/:repo/pulls`, () => HttpResponse.json(mockPRList)),
  http.get(`${BASE}/repos/:owner/:repo/pulls/:number`, () => HttpResponse.json(mockPR)),

  // Notifications
  http.get(`${BASE}/notifications`, () => HttpResponse.json(mockNotificationList)),
  http.patch(`${BASE}/notifications/threads/:id`, () => new HttpResponse(null, { status: 205 })),

  // Search
  http.get(`${BASE}/search/repositories`, () => HttpResponse.json(mockSearchRepos)),
  http.get(`${BASE}/search/code`, () => HttpResponse.json(mockSearchCode)),
  http.get(`${BASE}/search/issues`, () => HttpResponse.json(mockSearchIssues)),
];
