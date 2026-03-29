import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withGmailAction, requireConfirmation } from './helpers.js';

export function registerForwardCommand(gmail: Command) {
  gmail
    .command('forward <messageId>')
    .description('Forward a message')
    .requiredOption('--to <address>', 'Recipient email address')
    .action(
      withGmailAction(async (client, [messageId], opts, cmd) => {
        await requireConfirmation(`Forward message ${messageId} to ${opts.to}`, cmd);
        const result = await client.forward(messageId, opts.to);
        output({ data: result }, chalk.green(`Message forwarded (id: ${result.id})`), cmd);
      })
    );
}
