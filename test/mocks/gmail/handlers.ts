import { http, HttpResponse } from 'msw';
import {
  mockMessageList,
  mockMessageMetadata,
  mockMessageFull,
  mockSendResponse,
  mockDraftList,
  mockDraftGet,
  mockDraftCreate,
  mockLabelList,
} from './data.js';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const gmailHandlers = [
  // List messages
  http.get(`${BASE}/messages`, ({ request }) => {
    const url = new URL(request.url);
    const format = url.searchParams.get('format');
    // If requesting a specific message via the list endpoint this won't match;
    // specific gets are below.
    return HttpResponse.json(mockMessageList);
  }),

  // Get message (metadata or full)
  http.get(`${BASE}/messages/:id`, ({ params, request }) => {
    const url = new URL(request.url);
    const format = url.searchParams.get('format');
    const id = params.id as string;

    if (format === 'full' || !format) {
      if (id === 'msg-1') return HttpResponse.json(mockMessageFull);
      return HttpResponse.json({ ...mockMessageFull, id });
    }

    // metadata format
    return HttpResponse.json(mockMessageMetadata(id));
  }),

  // Send message
  http.post(`${BASE}/messages/send`, () => {
    return HttpResponse.json(mockSendResponse);
  }),

  // Modify message (labels)
  http.post(`${BASE}/messages/:id/modify`, ({ params }) => {
    return HttpResponse.json({ id: params.id, labelIds: ['INBOX'] });
  }),

  // Trash message
  http.post(`${BASE}/messages/:id/trash`, ({ params }) => {
    return HttpResponse.json({ id: params.id, labelIds: ['TRASH'] });
  }),

  // List drafts
  http.get(`${BASE}/drafts`, () => {
    return HttpResponse.json(mockDraftList);
  }),

  // Get draft
  http.get(`${BASE}/drafts/:id`, () => {
    return HttpResponse.json(mockDraftGet);
  }),

  // Create draft
  http.post(`${BASE}/drafts`, () => {
    return HttpResponse.json(mockDraftCreate);
  }),

  // Send draft
  http.post(`${BASE}/drafts/send`, () => {
    return HttpResponse.json(mockSendResponse);
  }),

  // Delete draft
  http.delete(`${BASE}/drafts/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // List labels
  http.get(`${BASE}/labels`, () => {
    return HttpResponse.json(mockLabelList);
  }),
];
