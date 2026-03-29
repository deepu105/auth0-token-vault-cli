import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withSlackAction, requireConfirmation } from './helpers.js';

export function registerPostCommand(slack: Command) {
  slack
    .command('post <channel>')
    .description('Post a message to a Slack channel')
    .requiredOption('--text <text>', 'Message text')
    .action(
      withSlackAction(async (client, [channel], opts, cmd) => {
        await requireConfirmation(`Post message to ${channel}`, cmd);
        const result = await client.postMessage(channel, opts.text);
        output(
          { data: result },
          chalk.green(`Message posted to ${result.channel} (ts: ${result.ts})`),
          cmd
        );
      })
    );
}
