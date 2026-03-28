import { WebClient } from '@slack/web-api';
import type {
  SlackChannel,
  SlackMessage,
  SlackUser,
  SlackSearchMatch,
  ChannelListResult,
  MessageListResult,
  SearchResult,
} from './types.js';

type TokenGetter = () => Promise<string>;

export class SlackClient {
  private readonly getToken: TokenGetter;

  constructor(getToken: TokenGetter) {
    this.getToken = getToken;
  }

  /** Create a new WebClient per call since the token may change on refresh. */
  private async api(): Promise<WebClient> {
    return new WebClient(await this.getToken());
  }

  // ── Channels ─────────────────────────────────────────────────

  async listChannels(opts?: {
    limit?: number;
    cursor?: string;
    types?: string;
  }): Promise<ChannelListResult> {
    const api = await this.api();
    const res = await api.conversations.list({
      types: opts?.types ?? 'public_channel,private_channel',
      limit: opts?.limit ?? 100,
      cursor: opts?.cursor,
      exclude_archived: false,
    });

    const channels: SlackChannel[] = (res.channels ?? []).map((ch) => ({
      id: ch.id!,
      name: ch.name ?? '',
      isPrivate: ch.is_private ?? false,
      isArchived: ch.is_archived ?? false,
      isMember: ch.is_member ?? false,
      topic: (ch.topic as any)?.value ?? '',
      purpose: (ch.purpose as any)?.value ?? '',
      numMembers: ch.num_members,
    }));

    return {
      channels,
      nextCursor: res.response_metadata?.next_cursor || undefined,
    };
  }

  // ── Messages ─────────────────────────────────────────────────

  async listMessages(
    channel: string,
    opts?: { limit?: number; cursor?: string; oldest?: string; latest?: string }
  ): Promise<MessageListResult> {
    const api = await this.api();
    const res = await api.conversations.history({
      channel,
      limit: opts?.limit ?? 20,
      cursor: opts?.cursor,
      oldest: opts?.oldest,
      latest: opts?.latest,
    });

    const messages: SlackMessage[] = (res.messages ?? []).map(parseMessage);

    return {
      messages,
      hasMore: res.has_more ?? false,
    };
  }

  // ── Search ───────────────────────────────────────────────────

  async searchMessages(
    query: string,
    opts?: { sort?: string; sortDir?: string; count?: number; page?: number }
  ): Promise<SearchResult> {
    const api = await this.api();
    const res = await api.search.messages({
      query,
      sort: (opts?.sort ?? 'timestamp') as 'timestamp' | 'score',
      sort_dir: (opts?.sortDir ?? 'desc') as 'desc' | 'asc',
      count: opts?.count ?? 20,
      page: opts?.page ?? 1,
    });

    const msgData = res.messages as any;
    const matches: SlackSearchMatch[] = (msgData?.matches ?? []).map((m: any) => ({
      ts: m.ts,
      channel: { id: m.channel?.id ?? '', name: m.channel?.name ?? '' },
      user: m.user ?? m.username ?? '',
      text: m.text ?? '',
      permalink: m.permalink ?? '',
    }));

    return {
      matches,
      total: msgData?.total ?? 0,
      page: msgData?.paging?.page ?? 1,
      pages: msgData?.paging?.pages ?? 1,
    };
  }

  // ── Post / Reply ─────────────────────────────────────────────

  async postMessage(channel: string, text: string): Promise<{ ts: string; channel: string }> {
    const api = await this.api();
    const res = await api.chat.postMessage({ channel, text });
    return { ts: res.ts!, channel: res.channel! };
  }

  async replyToThread(
    channel: string,
    threadTs: string,
    text: string
  ): Promise<{ ts: string; channel: string }> {
    const api = await this.api();
    const res = await api.chat.postMessage({ channel, text, thread_ts: threadTs });
    return { ts: res.ts!, channel: res.channel! };
  }

  // ── Reactions ────────────────────────────────────────────────

  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    const api = await this.api();
    await api.reactions.add({ channel, timestamp, name: emoji });
  }

  async removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    const api = await this.api();
    await api.reactions.remove({ channel, timestamp, name: emoji });
  }

  // ── Users ────────────────────────────────────────────────────

  async listUsers(opts?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ users: SlackUser[]; nextCursor?: string }> {
    const api = await this.api();
    const res = await api.users.list({
      limit: opts?.limit ?? 100,
      cursor: opts?.cursor,
    });

    const users: SlackUser[] = (res.members ?? []).map(parseUser);

    return {
      users,
      nextCursor: res.response_metadata?.next_cursor || undefined,
    };
  }

  async getUserInfo(userId: string): Promise<SlackUser> {
    const api = await this.api();
    const res = await api.users.info({ user: userId });
    return parseUser(res.user!);
  }

  // ── Status ───────────────────────────────────────────────────

  async setStatus(text: string, emoji?: string, expiration?: number): Promise<void> {
    const api = await this.api();
    await api.users.profile.set({
      profile: {
        status_text: text,
        status_emoji: emoji ?? '',
        status_expiration: expiration ?? 0,
      } as any,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function parseMessage(m: any): SlackMessage {
  return {
    ts: m.ts,
    user: m.user ?? '',
    text: m.text ?? '',
    threadTs: m.thread_ts,
    replyCount: m.reply_count,
    reactions: m.reactions?.map((r: any) => ({
      name: r.name,
      count: r.count,
      users: r.users ?? [],
    })),
  };
}

function parseUser(u: any): SlackUser {
  return {
    id: u.id!,
    name: u.name ?? '',
    realName: u.real_name ?? u.profile?.real_name ?? '',
    displayName: u.profile?.display_name ?? u.name ?? '',
    email: u.profile?.email,
    isBot: u.is_bot ?? false,
    isAdmin: u.is_admin ?? false,
    tz: u.tz,
    statusText: u.profile?.status_text,
    statusEmoji: u.profile?.status_emoji,
  };
}
