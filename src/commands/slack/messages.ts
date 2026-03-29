import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatMessageList } from '../../services/slack/formatters.js';
import { withSlackAction } from './helpers.js';

export function registerMessagesCommand(slack: Command) {
  slack
    .command('messages <channel>')
    .description('List messages in a Slack channel')
    .option('-n, --limit <n>', 'Maximum messages to return', '20')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--oldest <timestamp>', 'Only messages after this Unix timestamp')
    .option('--latest <timestamp>', 'Only messages before this Unix timestamp')
    .action(
      withSlackAction(async (client, [channel], opts, cmd) => {
        const result = await client.listMessages(channel, {
          limit: parseInt(opts.limit, 10),
          cursor: opts.cursor,
          oldest: opts.oldest,
          latest: opts.latest,
        });
        output({ data: result }, formatMessageList(result), cmd);
      })
    );
}
