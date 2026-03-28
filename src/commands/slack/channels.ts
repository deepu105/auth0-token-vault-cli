import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatChannelList } from '../../services/slack/formatters.js';
import { createSlackClient, handleSlackError } from './helpers.js';

export function registerChannelsCommand(slack: Command) {
  slack
    .command('channels')
    .description('List Slack channels')
    .option('-n, --limit <n>', 'Maximum channels to return', '100')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(async (opts, cmd: Command) => {
      try {
        const client = await createSlackClient(cmd);
        const result = await client.listChannels({
          limit: parseInt(opts.limit, 10),
          cursor: opts.cursor,
        });
        output({ data: result }, formatChannelList(result), cmd);
      } catch (err) {
        handleSlackError(err, cmd);
      }
    });
}
