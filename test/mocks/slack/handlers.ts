import { http, HttpResponse } from 'msw';
import {
  mockChannelList,
  mockConversationHistory,
  mockSearchMessages,
  mockPostMessage,
  mockReactionOk,
  mockUserList,
  mockUserInfo,
  mockProfileSet,
} from './data.js';

const BASE = 'https://slack.com/api';

export const slackHandlers = [
  // conversations.list
  http.post(`${BASE}/conversations.list`, () => {
    return HttpResponse.json(mockChannelList);
  }),

  // conversations.history
  http.post(`${BASE}/conversations.history`, () => {
    return HttpResponse.json(mockConversationHistory);
  }),

  // search.messages
  http.post(`${BASE}/search.messages`, () => {
    return HttpResponse.json(mockSearchMessages);
  }),

  // chat.postMessage
  http.post(`${BASE}/chat.postMessage`, () => {
    return HttpResponse.json(mockPostMessage);
  }),

  // reactions.add
  http.post(`${BASE}/reactions.add`, () => {
    return HttpResponse.json(mockReactionOk);
  }),

  // reactions.remove
  http.post(`${BASE}/reactions.remove`, () => {
    return HttpResponse.json(mockReactionOk);
  }),

  // users.list
  http.post(`${BASE}/users.list`, () => {
    return HttpResponse.json(mockUserList);
  }),

  // users.info
  http.post(`${BASE}/users.info`, () => {
    return HttpResponse.json(mockUserInfo);
  }),

  // users.profile.set
  http.post(`${BASE}/users.profile.set`, () => {
    return HttpResponse.json(mockProfileSet);
  }),
];
