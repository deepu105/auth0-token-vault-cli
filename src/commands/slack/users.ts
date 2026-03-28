import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatUserList, formatUserInfo } from '../../services/slack/formatters.js';
import { createSlackClient, handleSlackError } from './helpers.js';

export function registerUsersCommand(slack: Command) {
  slack
    .command('users')
    .description('List Slack users')
    .option('-n, --limit <n>', 'Maximum users to return', '100')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(async (opts, cmd: Command) => {
      try {
        const client = await createSlackClient(cmd);
        const result = await client.listUsers({
          limit: parseInt(opts.limit, 10),
          cursor: opts.cursor,
        });
        output({ data: result }, formatUserList(result.users), cmd);
      } catch (err) {
        handleSlackError(err, cmd);
      }
    });
}

export function registerUserCommand(slack: Command) {
  slack
    .command('user <userId>')
    .description('Get info about a Slack user')
    .action(async (userId: string, _opts, cmd: Command) => {
      try {
        const client = await createSlackClient(cmd);
        const user = await client.getUserInfo(userId);
        output({ data: user }, formatUserInfo(user), cmd);
      } catch (err) {
        handleSlackError(err, cmd);
      }
    });
}
