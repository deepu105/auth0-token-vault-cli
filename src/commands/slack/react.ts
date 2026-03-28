import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../../utils/output.js';
import { EXIT_INVALID_INPUT } from '../../utils/exit-codes.js';
import { createSlackClient, handleSlackError } from './helpers.js';

export function registerReactCommand(slack: Command) {
  slack
    .command('react <channel> <timestamp>')
    .description('Add or remove a reaction on a Slack message')
    .option('--add <emoji>', 'Add a reaction (emoji name without colons)')
    .option('--remove <emoji>', 'Remove a reaction (emoji name without colons)')
    .action(async (channel: string, timestamp: string, opts, cmd: Command) => {
      try {
        if (!opts.add && !opts.remove) {
          outputError(
            { code: 'missing_option', message: 'Provide --add or --remove with an emoji name.' },
            cmd
          );
          process.exit(EXIT_INVALID_INPUT);
        }

        const client = await createSlackClient(cmd);

        if (opts.add) {
          await client.addReaction(channel, timestamp, opts.add);
          output(
            { data: { action: 'added', emoji: opts.add, channel, timestamp } },
            chalk.green(`Reaction :${opts.add}: added`),
            cmd
          );
        }

        if (opts.remove) {
          await client.removeReaction(channel, timestamp, opts.remove);
          output(
            { data: { action: 'removed', emoji: opts.remove, channel, timestamp } },
            chalk.green(`Reaction :${opts.remove}: removed`),
            cmd
          );
        }
      } catch (err) {
        handleSlackError(err, cmd);
      }
    });
}
