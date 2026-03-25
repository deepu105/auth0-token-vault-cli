import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { createGmailClient, handleGmailError, requireConfirmation } from './helpers.js';

export function registerForwardCommand(gmail: Command) {
  gmail
    .command('forward <messageId>')
    .description('Forward a message')
    .requiredOption('--to <address>', 'Recipient email address')
    .action(async (messageId: string, opts, cmd: Command) => {
      try {
        await requireConfirmation(`Forward message ${messageId} to ${opts.to}`, cmd);

        const client = await createGmailClient(cmd);
        const result = await client.forward(messageId, opts.to);

        output(
          { data: result },
          chalk.green(`Message forwarded (id: ${result.id})`),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
