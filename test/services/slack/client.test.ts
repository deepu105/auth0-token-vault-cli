import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { slackHandlers } from '../../mocks/slack/handlers.js';
import { SlackClient } from '../../../src/services/slack/client.js';

describe('SlackClient', () => {
  const msw = setupServer(...slackHandlers);
  let client: SlackClient;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => msw.resetHandlers());

  beforeAll(() => {
    client = new SlackClient(async () => 'mock-slack-token');
  });

  // ── Channels ─────────────────────────────────────────────────

  it('listChannels returns channel list', async () => {
    const result = await client.listChannels();
    expect(result.channels).toHaveLength(3);
    expect(result.channels[0].name).toBe('general');
    expect(result.channels[0].numMembers).toBe(42);
    expect(result.channels[2].isPrivate).toBe(true);
  });

  // ── Messages ─────────────────────────────────────────────────

  it('listMessages returns message list', async () => {
    const result = await client.listMessages('C001');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].user).toBe('U001');
    expect(result.messages[0].text).toBe('Hello everyone!');
    expect(result.messages[0].replyCount).toBe(2);
    expect(result.messages[0].reactions).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  // ── Search ───────────────────────────────────────────────────

  it('searchMessages returns search results', async () => {
    const result = await client.searchMessages('release');
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].channel.name).toBe('general');
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pages).toBe(1);
  });

  // ── Post / Reply ─────────────────────────────────────────────

  it('postMessage returns ts and channel', async () => {
    const result = await client.postMessage('C001', 'Hello!');
    expect(result.ts).toBe('1711360300.000004');
    expect(result.channel).toBe('C001');
  });

  it('replyToThread returns ts and channel', async () => {
    const result = await client.replyToThread('C001', '1711360000.000001', 'Reply text');
    expect(result.ts).toBe('1711360300.000004');
    expect(result.channel).toBe('C001');
  });

  // ── Reactions ────────────────────────────────────────────────

  it('addReaction completes without error', async () => {
    await expect(
      client.addReaction('C001', '1711360000.000001', 'thumbsup')
    ).resolves.toBeUndefined();
  });

  it('removeReaction completes without error', async () => {
    await expect(
      client.removeReaction('C001', '1711360000.000001', 'thumbsup')
    ).resolves.toBeUndefined();
  });

  // ── Users ────────────────────────────────────────────────────

  it('listUsers returns user list', async () => {
    const result = await client.listUsers();
    expect(result.users).toHaveLength(3);
    expect(result.users[0].name).toBe('alice');
    expect(result.users[0].isAdmin).toBe(true);
    expect(result.users[2].isBot).toBe(true);
  });

  it('getUserInfo returns user details', async () => {
    const user = await client.getUserInfo('U001');
    expect(user.id).toBe('U001');
    expect(user.realName).toBe('Alice Johnson');
    expect(user.email).toBe('alice@example.com');
    expect(user.statusText).toBe('Working remotely');
  });

  // ── Status ───────────────────────────────────────────────────

  it('setStatus completes without error', async () => {
    await expect(client.setStatus('In a meeting', ':calendar:')).resolves.toBeUndefined();
  });

  // ── Token getter ─────────────────────────────────────────────

  it('calls token getter before each operation', async () => {
    const tokenFn = vi.fn(async () => 'fresh-token');
    const freshClient = new SlackClient(tokenFn);
    await freshClient.listChannels();
    expect(tokenFn).toHaveBeenCalledOnce();

    await freshClient.listChannels();
    expect(tokenFn).toHaveBeenCalledTimes(2);
  });
});
