import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatUserList, formatUserInfo } from '../../services/slack/formatters.js';
import { withSlackAction } from './helpers.js';

export function registerUsersCommand(slack: Command) {
  slack
    .command('users')
    .description('List Slack users')
    .option('-n, --limit <n>', 'Maximum users to return', '100')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(
      withSlackAction(async (client, _args, opts, cmd) => {
        const result = await client.listUsers({
          limit: parseInt(opts.limit, 10),
          cursor: opts.cursor,
        });
        output({ data: result }, formatUserList(result.users), cmd);
      })
    );
}

export function registerUserCommand(slack: Command) {
  slack
    .command('user <userId>')
    .description('Get info about a Slack user')
    .action(
      withSlackAction(async (client, [userId], _opts, cmd) => {
        const user = await client.getUserInfo(userId);
        output({ data: user }, formatUserInfo(user), cmd);
      })
    );
}
