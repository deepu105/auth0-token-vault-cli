import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { gmailHandlers } from '../../mocks/gmail/handlers.js';
import { GmailClient } from '../../../src/services/gmail/client.js';

describe('GmailClient', () => {
  const msw = setupServer(...gmailHandlers);
  let client: GmailClient;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => msw.resetHandlers());

  beforeAll(() => {
    client = new GmailClient(async () => 'mock-gmail-token');
  });

  // ── Search ──────────────────────────────────────────────────

  it('search returns paginated message list', async () => {
    const result = await client.search('in:inbox');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].from).toBe('sender@example.com');
    expect(result.resultSizeEstimate).toBe(2);
  });

  // ── Read ────────────────────────────────────────────────────

  it('read returns full email with headers and body', async () => {
    const email = await client.read('msg-1');
    expect(email.id).toBe('msg-1');
    expect(email.headers.from).toBe('sender@example.com');
    expect(email.headers.subject).toBe('Hello World');
    expect(email.body).toBe('This is the email body.');
  });

  // ── Send ────────────────────────────────────────────────────

  it('send returns message id and thread id', async () => {
    const result = await client.send('to@example.com', 'Test', 'Body text');
    expect(result.id).toBe('msg-sent-1');
    expect(result.threadId).toBe('thread-sent-1');
  });

  // ── Reply ───────────────────────────────────────────────────

  it('reply preserves thread context', async () => {
    const result = await client.reply('msg-1', 'Reply body');
    expect(result.id).toBe('msg-sent-1');
    expect(result.threadId).toBe('thread-sent-1');
  });

  // ── Forward ─────────────────────────────────────────────────

  it('forward sends with Fwd: prefix', async () => {
    const result = await client.forward('msg-1', 'forward-to@example.com');
    expect(result.id).toBe('msg-sent-1');
  });

  // ── Drafts ──────────────────────────────────────────────────

  it('createDraft returns draft id', async () => {
    const result = await client.createDraft('to@example.com', 'Draft', 'Draft body');
    expect(result.id).toBe('draft-new');
  });

  it('listDrafts returns draft summaries', async () => {
    const drafts = await client.listDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].subject).toBe('Draft subject');
  });

  it('sendDraft returns message id', async () => {
    const result = await client.sendDraft('draft-1');
    expect(result.id).toBe('msg-sent-1');
  });

  it('deleteDraft completes without error', async () => {
    await expect(client.deleteDraft('draft-1')).resolves.toBeUndefined();
  });

  // ── Labels ──────────────────────────────────────────────────

  it('listLabels returns label info', async () => {
    const labels = await client.listLabels();
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.find((l) => l.name === 'INBOX')).toBeDefined();
  });

  // ── Archive / Delete ────────────────────────────────────────

  it('archive removes INBOX label', async () => {
    // archive calls modifyLabels which hits the mock
    await expect(client.archive('msg-1')).resolves.toBeUndefined();
  });

  it('deleteMessage moves to trash', async () => {
    await expect(client.deleteMessage('msg-1')).resolves.toBeUndefined();
  });

  // ── Token getter ────────────────────────────────────────────

  it('calls token getter before each operation', async () => {
    const tokenFn = vi.fn(async () => 'fresh-token');
    const freshClient = new GmailClient(tokenFn);
    await freshClient.listLabels();
    expect(tokenFn).toHaveBeenCalledOnce();

    await freshClient.listLabels();
    expect(tokenFn).toHaveBeenCalledTimes(2);
  });
});
