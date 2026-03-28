import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { createGitHubClient, handleGitHubError, requireConfirmation } from './helpers.js';
import { formatNotificationList } from '../../services/github/formatters.js';

export function registerNotificationsCommand(github: Command) {
  github
    .command('notifications')
    .description('List your GitHub notifications')
    .option('--all', 'Include read notifications', false)
    .option('-n, --limit <n>', 'Maximum notifications to return', '30')
    .action(async (opts, cmd: Command) => {
      try {
        const client = await createGitHubClient(cmd);
        const notifications = await client.listNotifications({
          all: opts.all,
          perPage: parseInt(opts.limit, 10),
        });
        output({ data: { notifications } }, formatNotificationList(notifications), cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });
}

export function registerNotificationCommand(github: Command) {
  const notification = github.command('notification').description('Manage a GitHub notification');

  notification
    .command('read <id>')
    .description('Mark a notification as read')
    .action(async (id: string, _opts, cmd: Command) => {
      try {
        await requireConfirmation('mark notification as read', cmd);

        const client = await createGitHubClient(cmd);
        await client.markNotificationRead(id);

        output({ status: 'read', id }, 'Notification marked as read', cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });
}
