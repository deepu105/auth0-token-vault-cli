import chalk from 'chalk';
import type { EmailFull, SearchResult, DraftSummary, LabelInfo } from './types.js';
import { truncate } from '../../utils/format-helpers.js';

export function formatSearchResult(result: SearchResult): string {
  if (result.messages.length === 0) {
    return chalk.yellow('No messages found.');
  }

  const lines = result.messages.map((m, i) => {
    const idx = chalk.dim(`${i + 1}.`);
    const from = chalk.cyan(truncate(m.from, 30));
    const subject = chalk.bold(truncate(m.subject, 50));
    const date = chalk.dim(m.date);
    return `${idx} ${from}  ${subject}  ${date}\n   ${chalk.dim(m.snippet)}`;
  });

  const header = chalk.dim(`${result.resultSizeEstimate} results`);
  const footer = result.nextPageToken ? chalk.dim('\nMore results available.') : '';

  return `${header}\n\n${lines.join('\n\n')}${footer}`;
}

export function formatEmailFull(email: EmailFull): string {
  const lines = [
    `${chalk.bold('From:')}    ${email.headers.from}`,
    `${chalk.bold('To:')}      ${email.headers.to}`,
    `${chalk.bold('Date:')}    ${email.headers.date}`,
    `${chalk.bold('Subject:')} ${email.headers.subject}`,
  ];

  if (email.attachments.length > 0) {
    const attachList = email.attachments
      .map((a) => `  ${a.filename} (${a.mimeType}, ${formatBytes(a.size)})`)
      .join('\n');
    lines.push(`${chalk.bold('Attachments:')}\n${attachList}`);
  }

  lines.push('', chalk.dim('─'.repeat(60)), '', email.body);

  return lines.join('\n');
}

export function formatDraftList(drafts: DraftSummary[]): string {
  if (drafts.length === 0) {
    return chalk.yellow('No drafts.');
  }

  return drafts
    .map((d, i) => {
      const idx = chalk.dim(`${i + 1}.`);
      return `${idx} ${chalk.bold(d.subject || '(no subject)')} → ${d.to}\n   ${chalk.dim(d.snippet)}`;
    })
    .join('\n\n');
}

export function formatLabelList(labels: LabelInfo[]): string {
  return labels
    .map((l) => {
      const count =
        l.messagesTotal !== undefined ? chalk.dim(` (${l.messagesTotal} messages)`) : '';
      return `  ${chalk.cyan(l.name)}${count}`;
    })
    .join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
