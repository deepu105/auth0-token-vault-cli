import chalk from 'chalk';
import { truncate } from '../../utils/format-helpers.js';
import type {
  GitHubRepo,
  GitHubIssue,
  GitHubPullRequest,
  GitHubComment,
  GitHubNotification,
  GitHubSearchResult,
  GitHubCodeSearchItem,
} from './types.js';

export function formatRepoList(repos: GitHubRepo[]): string {
  if (repos.length === 0) return chalk.yellow('No repositories found.');

  return repos
    .map((r) => {
      const name = chalk.cyan(r.fullName);
      const priv = r.private ? chalk.dim(' (private)') : '';
      const lang = r.language ? chalk.dim(` [${r.language}]`) : '';
      const stars = r.stargazersCount > 0 ? chalk.dim(` ★${r.stargazersCount}`) : '';
      const desc = r.description ? `\n   ${chalk.dim(truncate(r.description, 60))}` : '';
      return `  ${name}${priv}${lang}${stars}${desc}`;
    })
    .join('\n');
}

export function formatRepo(r: GitHubRepo): string {
  const lines = [
    `${chalk.bold('Repository:')}  ${chalk.cyan(r.fullName)}${r.private ? chalk.dim(' (private)') : ''}`,
    `${chalk.bold('Description:')} ${r.description || chalk.dim('(none)')}`,
    `${chalk.bold('Language:')}    ${r.language || chalk.dim('(none)')}`,
    `${chalk.bold('Stars:')}       ${r.stargazersCount}  ${chalk.bold('Forks:')} ${r.forksCount}  ${chalk.bold('Issues:')} ${r.openIssuesCount}`,
    `${chalk.bold('Default:')}     ${r.defaultBranch}`,
    `${chalk.bold('URL:')}         ${r.htmlUrl}`,
  ];
  return lines.join('\n');
}

export function formatIssueList(issues: GitHubIssue[]): string {
  if (issues.length === 0) return chalk.yellow('No issues found.');

  return issues
    .map((i) => {
      const state = i.state === 'open' ? chalk.green('open') : chalk.red('closed');
      const num = chalk.dim(`#${i.number}`);
      const labels = i.labels.length
        ? ' ' + i.labels.map((l) => chalk.dim(`[${l.name}]`)).join(' ')
        : '';
      const comments = i.comments > 0 ? chalk.dim(` (${i.comments} comments)`) : '';
      return `  ${num} ${state}  ${i.title}${labels}${comments}`;
    })
    .join('\n');
}

export function formatIssue(i: GitHubIssue): string {
  const state = i.state === 'open' ? chalk.green('open') : chalk.red('closed');
  const lines = [
    `${chalk.bold(`#${i.number}`)} ${i.title}  ${state}`,
    `${chalk.bold('Author:')}   ${i.user.login}`,
  ];

  if (i.assignees.length > 0) {
    lines.push(`${chalk.bold('Assigned:')} ${i.assignees.map((a) => a.login).join(', ')}`);
  }
  if (i.labels.length > 0) {
    lines.push(`${chalk.bold('Labels:')}   ${i.labels.map((l) => l.name).join(', ')}`);
  }
  lines.push(`${chalk.bold('URL:')}      ${i.htmlUrl}`);
  if (i.body) {
    lines.push('', i.body);
  }

  return lines.join('\n');
}

export function formatPRList(prs: GitHubPullRequest[]): string {
  if (prs.length === 0) return chalk.yellow('No pull requests found.');

  return prs
    .map((p) => {
      const state = p.merged
        ? chalk.magenta('merged')
        : p.draft
          ? chalk.yellow('draft')
          : p.state === 'open'
            ? chalk.green('open')
            : chalk.red('closed');
      const num = chalk.dim(`#${p.number}`);
      const stats = chalk.dim(` +${p.additions} -${p.deletions}`);
      return `  ${num} ${state}  ${p.title}${stats}`;
    })
    .join('\n');
}

export function formatPR(p: GitHubPullRequest): string {
  const state = p.merged
    ? chalk.magenta('merged')
    : p.draft
      ? chalk.yellow('draft')
      : p.state === 'open'
        ? chalk.green('open')
        : chalk.red('closed');
  const lines = [
    `${chalk.bold(`#${p.number}`)} ${p.title}  ${state}`,
    `${chalk.bold('Author:')}   ${p.user.login}`,
    `${chalk.bold('Changes:')}  ${chalk.green(`+${p.additions}`)} ${chalk.red(`-${p.deletions}`)} in ${p.changedFiles} files`,
    `${chalk.bold('URL:')}      ${p.htmlUrl}`,
  ];

  if (p.labels.length > 0) {
    lines.push(`${chalk.bold('Labels:')}   ${p.labels.map((l) => l.name).join(', ')}`);
  }
  if (p.body) {
    lines.push('', p.body);
  }

  return lines.join('\n');
}

export function formatCommentList(comments: GitHubComment[]): string {
  if (comments.length === 0) return chalk.yellow('No comments.');

  return comments
    .map((c) => {
      const user = chalk.cyan(c.user.login);
      const date = chalk.dim(c.createdAt.replace('T', ' ').replace('Z', ' UTC'));
      return `  ${user}  ${date}\n   ${truncate(c.body, 80)}`;
    })
    .join('\n\n');
}

export function formatNotificationList(notifications: GitHubNotification[]): string {
  if (notifications.length === 0) return chalk.yellow('No notifications.');

  return notifications
    .map((n) => {
      const unread = n.unread ? chalk.bold('●') : chalk.dim('○');
      const type = chalk.dim(`[${n.subject.type}]`);
      const repo = chalk.cyan(n.repository.fullName);
      const reason = chalk.dim(`(${n.reason})`);
      return `  ${unread} ${type} ${repo}  ${n.subject.title} ${reason}`;
    })
    .join('\n');
}

export function formatSearchRepoResults(result: GitHubSearchResult<GitHubRepo>): string {
  const header = chalk.dim(`${result.totalCount} results`);
  if (result.items.length === 0) return chalk.yellow('No repositories found.');
  return `${header}\n\n${formatRepoList(result.items)}`;
}

export function formatSearchCodeResults(result: GitHubSearchResult<GitHubCodeSearchItem>): string {
  const header = chalk.dim(`${result.totalCount} results`);
  if (result.items.length === 0) return chalk.yellow('No code results found.');

  const lines = result.items.map((item) => {
    const repo = chalk.cyan(item.repository.fullName);
    const path = chalk.bold(item.path);
    return `  ${repo} ${path}`;
  });

  return `${header}\n\n${lines.join('\n')}`;
}

export function formatSearchIssueResults(result: GitHubSearchResult<GitHubIssue>): string {
  const header = chalk.dim(`${result.totalCount} results`);
  if (result.items.length === 0) return chalk.yellow('No issues found.');
  return `${header}\n\n${formatIssueList(result.items)}`;
}
