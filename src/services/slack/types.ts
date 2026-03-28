export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  topic: string;
  purpose: string;
  numMembers?: number;
}

export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  threadTs?: string;
  replyCount?: number;
  reactions?: Array<{ name: string; count: number; users: string[] }>;
}

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email?: string;
  isBot: boolean;
  isAdmin: boolean;
  tz?: string;
  statusText?: string;
  statusEmoji?: string;
}

export interface SlackSearchMatch {
  ts: string;
  channel: { id: string; name: string };
  user: string;
  text: string;
  permalink: string;
}

export interface ChannelListResult {
  channels: SlackChannel[];
  nextCursor?: string;
}

export interface MessageListResult {
  messages: SlackMessage[];
  hasMore: boolean;
}

export interface SearchResult {
  matches: SlackSearchMatch[];
  total: number;
  page: number;
  pages: number;
}
