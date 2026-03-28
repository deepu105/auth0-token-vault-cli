import { Command } from 'commander';
import { registerReposCommand, registerRepoCommand } from './repos.js';
import { registerIssuesCommand, registerIssueCommand } from './issues.js';
import { registerPRsCommand, registerPRCommand } from './prs.js';
import { registerNotificationsCommand, registerNotificationCommand } from './notifications.js';
import { registerSearchCommand } from './search.js';

export function createGitHubCommand(): Command {
  const github = new Command('github').description('GitHub commands');

  registerReposCommand(github);
  registerRepoCommand(github);
  registerIssuesCommand(github);
  registerIssueCommand(github);
  registerPRsCommand(github);
  registerPRCommand(github);
  registerNotificationsCommand(github);
  registerNotificationCommand(github);
  registerSearchCommand(github);

  return github;
}
