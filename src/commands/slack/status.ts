import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withSlackAction } from './helpers.js';

export function registerStatusCommand(slack: Command) {
  slack
    .command('status')
    .description('Set your Slack status')
    .requiredOption('--text <text>', 'Status text')
    .option('--emoji <emoji>', 'Status emoji (e.g. :house_with_garden:)')
    .option('--expiration <minutes>', 'Status expiration in minutes')
    .action(
      withSlackAction(async (client, _args, opts, cmd) => {
        const expiration = opts.expiration
          ? Math.floor(Date.now() / 1000) + parseInt(opts.expiration, 10) * 60
          : undefined;
        await client.setStatus(opts.text, opts.emoji, expiration);
        output(
          { data: { status: opts.text, emoji: opts.emoji, expiration } },
          chalk.green(`Status set: ${opts.emoji ?? ''} ${opts.text}`),
          cmd
        );
      })
    );
}
