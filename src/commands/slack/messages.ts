import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatMessageList } from '../../services/slack/formatters.js';
import { createSlackClient, handleSlackError } from './helpers.js';

export function registerMessagesCommand(slack: Command) {
  slack
    .command('messages <channel>')
    .description('List messages in a Slack channel')
    .option('-n, --limit <n>', 'Maximum messages to return', '20')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--oldest <timestamp>', 'Only messages after this Unix timestamp')
    .option('--latest <timestamp>', 'Only messages before this Unix timestamp')
    .action(async (channel: string, opts, cmd: Command) => {
      try {
        const client = await createSlackClient(cmd);
        const result = await client.listMessages(channel, {
          limit: parseInt(opts.limit, 10),
          cursor: opts.cursor,
          oldest: opts.oldest,
          latest: opts.latest,
        });
        output({ data: result }, formatMessageList(result), cmd);
      } catch (err) {
        handleSlackError(err, cmd);
      }
    });
}
