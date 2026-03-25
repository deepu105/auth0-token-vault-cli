/** Minimal Gmail API response fixtures */

export const mockMessageList = {
  messages: [
    { id: 'msg-1', threadId: 'thread-1' },
    { id: 'msg-2', threadId: 'thread-2' },
  ],
  resultSizeEstimate: 2,
};

export const mockMessageMetadata = (id: string) => ({
  id,
  threadId: `thread-${id}`,
  snippet: `Snippet for ${id}`,
  labelIds: ['INBOX'],
  payload: {
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'Subject', value: `Test subject ${id}` },
      { name: 'Date', value: 'Wed, 25 Mar 2026 10:00:00 +0000' },
    ],
  },
});

export const mockMessageFull = {
  id: 'msg-1',
  threadId: 'thread-1',
  labelIds: ['INBOX'],
  payload: {
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'To', value: 'me@example.com' },
      { name: 'Subject', value: 'Hello World' },
      { name: 'Date', value: 'Wed, 25 Mar 2026 10:00:00 +0000' },
      { name: 'Message-ID', value: '<abc123@example.com>' },
    ],
    mimeType: 'text/plain',
    body: {
      data: Buffer.from('This is the email body.').toString('base64url'),
    },
  },
};

export const mockSendResponse = {
  id: 'msg-sent-1',
  threadId: 'thread-sent-1',
  labelIds: ['SENT'],
};

export const mockDraftList = {
  drafts: [{ id: 'draft-1', message: { id: 'msg-draft-1' } }],
};

export const mockDraftGet = {
  id: 'draft-1',
  message: {
    id: 'msg-draft-1',
    snippet: 'Draft snippet',
    payload: {
      headers: [
        { name: 'Subject', value: 'Draft subject' },
        { name: 'To', value: 'draft-to@example.com' },
      ],
    },
  },
};

export const mockDraftCreate = {
  id: 'draft-new',
  message: { id: 'msg-draft-new' },
};

export const mockLabelList = {
  labels: [
    { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 42, messagesUnread: 5 },
    { id: 'SENT', name: 'SENT', type: 'system', messagesTotal: 100 },
    { id: 'Label_1', name: 'Work', type: 'user', messagesTotal: 10, messagesUnread: 2 },
  ],
};
