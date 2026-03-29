import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withGmailAction, requireBody, requireConfirmation } from './helpers.js';

export function registerSendCommand(gmail: Command) {
  gmail
    .command('send')
    .description('Send a new message')
    .requiredOption('--to <address>', 'Recipient email address')
    .requiredOption('--subject <subject>', 'Email subject')
    .option('--body <text>', 'Email body text')
    .option('--body-file <path>', 'Read body from file')
    .action(
      withGmailAction(async (client, _args, opts, cmd) => {
        const body = await requireBody(opts, 'Email body', cmd);
        await requireConfirmation(`Send email to ${opts.to}`, cmd);
        const result = await client.send(opts.to, opts.subject, body);
        output({ data: result }, chalk.green(`Message sent (id: ${result.id})`), cmd);
      })
    );
}
