import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../../utils/output.js';
import { EXIT_INVALID_INPUT } from '../../utils/exit-codes.js';
import { createGmailClient, handleGmailError, requireConfirmation, resolveBody } from './helpers.js';

export function registerSendCommand(gmail: Command) {
  gmail
    .command('send')
    .description('Send a new message')
    .requiredOption('--to <address>', 'Recipient email address')
    .requiredOption('--subject <subject>', 'Email subject')
    .option('--body <text>', 'Email body text')
    .option('--body-file <path>', 'Read body from file')
    .action(async (opts, cmd: Command) => {
      try {
        const body = await resolveBody(opts);
        if (!body) {
          outputError(
            {
              code: 'missing_body',
              message: 'Email body required. Use --body, --body-file, or pipe via stdin.',
            },
            cmd
          );
          process.exit(EXIT_INVALID_INPUT);
        }

        await requireConfirmation(`Send email to ${opts.to}`, cmd);

        const client = await createGmailClient(cmd);
        const result = await client.send(opts.to, opts.subject, body);

        output(
          { data: result },
          chalk.green(`Message sent (id: ${result.id})`),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
