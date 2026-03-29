import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withSlackAction, requireConfirmation } from './helpers.js';

export function registerReplyCommand(slack: Command) {
  slack
    .command('reply <channel> <threadTs>')
    .description('Reply to a Slack thread')
    .requiredOption('--text <text>', 'Reply text')
    .action(
      withSlackAction(async (client, [channel, threadTs], opts, cmd) => {
        await requireConfirmation(`Reply to thread ${threadTs} in ${channel}`, cmd);
        const result = await client.replyToThread(channel, threadTs, opts.text);
        output(
          { data: result },
          chalk.green(`Reply posted to ${result.channel} (ts: ${result.ts})`),
          cmd
        );
      })
    );
}
