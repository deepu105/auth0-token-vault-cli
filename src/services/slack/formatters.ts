import chalk from 'chalk';
import { truncate } from '../../utils/format-helpers.js';
import type {
  ChannelListResult,
  MessageListResult,
  SearchResult,
  SlackUser,
} from './types.js';

export function formatChannelList(result: ChannelListResult): string {
  if (result.channels.length === 0) {
    return chalk.yellow('No channels found.');
  }

  const lines = result.channels.map((ch) => {
    const name = chalk.cyan(`#${ch.name}`);
    const priv = ch.isPrivate ? chalk.dim(' (private)') : '';
    const archived = ch.isArchived ? chalk.dim(' [archived]') : '';
    const members =
      ch.numMembers !== undefined ? chalk.dim(` (${ch.numMembers} members)`) : '';
    const purpose = ch.purpose ? `\n   ${chalk.dim(truncate(ch.purpose, 60))}` : '';
    return `  ${name}${priv}${archived}${members}${purpose}`;
  });

  const footer = result.nextCursor
    ? chalk.dim('\nMore channels available.')
    : '';

  return `${lines.join('\n')}${footer}`;
}

export function formatMessageList(result: MessageListResult): string {
  if (result.messages.length === 0) {
    return chalk.yellow('No messages found.');
  }

  const lines = result.messages.map((m, i) => {
    const idx = chalk.dim(`${i + 1}.`);
    const user = chalk.cyan(m.user);
    const text = truncate(m.text, 80);
    const ts = chalk.dim(formatTimestamp(m.ts));
    const thread =
      m.replyCount !== undefined && m.replyCount > 0
        ? chalk.dim(` (${m.replyCount} replies)`)
        : '';
    const reactions = m.reactions?.length
      ? `\n   ${m.reactions.map((r) => `${r.name} (${r.count})`).join('  ')}`
      : '';
    return `${idx} ${user}  ${ts}${thread}\n   ${text}${reactions}`;
  });

  const footer = result.hasMore ? chalk.dim('\nMore messages available.') : '';

  return `${lines.join('\n\n')}${footer}`;
}

export function formatSearchResult(result: SearchResult): string {
  if (result.matches.length === 0) {
    return chalk.yellow('No messages found.');
  }

  const lines = result.matches.map((m, i) => {
    const idx = chalk.dim(`${i + 1}.`);
    const channel = chalk.cyan(`#${m.channel.name}`);
    const user = chalk.bold(m.user);
    const text = truncate(m.text, 80);
    return `${idx} ${channel}  ${user}\n   ${text}`;
  });

  const header = chalk.dim(`${result.total} results (page ${result.page}/${result.pages})`);

  return `${header}\n\n${lines.join('\n\n')}`;
}

export function formatUserList(users: SlackUser[]): string {
  if (users.length === 0) {
    return chalk.yellow('No users found.');
  }

  return users
    .map((u) => {
      const name = chalk.cyan(u.displayName || u.name);
      const real = u.realName ? chalk.dim(` (${u.realName})`) : '';
      const bot = u.isBot ? chalk.dim(' [bot]') : '';
      const admin = u.isAdmin ? chalk.dim(' [admin]') : '';
      return `  ${name}${real}${bot}${admin}`;
    })
    .join('\n');
}

export function formatUserInfo(user: SlackUser): string {
  const lines = [
    `${chalk.bold('Name:')}         ${user.realName || user.name}`,
    `${chalk.bold('Display Name:')} ${user.displayName}`,
    `${chalk.bold('Username:')}     ${user.name}`,
  ];

  if (user.email) {
    lines.push(`${chalk.bold('Email:')}        ${user.email}`);
  }
  if (user.tz) {
    lines.push(`${chalk.bold('Timezone:')}     ${user.tz}`);
  }
  if (user.statusText) {
    const emoji = user.statusEmoji ? `${user.statusEmoji} ` : '';
    lines.push(`${chalk.bold('Status:')}       ${emoji}${user.statusText}`);
  }

  const flags: string[] = [];
  if (user.isBot) flags.push('bot');
  if (user.isAdmin) flags.push('admin');
  if (flags.length > 0) {
    lines.push(`${chalk.bold('Flags:')}        ${chalk.dim(flags.join(', '))}`);
  }

  return lines.join('\n');
}


function formatTimestamp(ts: string): string {
  const seconds = parseFloat(ts);
  if (isNaN(seconds)) return ts;
  return new Date(seconds * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}
