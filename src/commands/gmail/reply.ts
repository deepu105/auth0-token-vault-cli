import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../../utils/output.js';
import { EXIT_INVALID_INPUT } from '../../utils/exit-codes.js';
import { createGmailClient, handleGmailError, requireConfirmation, resolveBody } from './helpers.js';

export function registerReplyCommand(gmail: Command) {
  gmail
    .command('reply <messageId>')
    .description('Reply to a message')
    .option('--body <text>', 'Reply body text')
    .option('--body-file <path>', 'Read body from file')
    .action(async (messageId: string, opts, cmd: Command) => {
      try {
        const body = await resolveBody(opts);
        if (!body) {
          outputError(
            { code: 'missing_body', message: 'Reply body required. Use --body, --body-file, or pipe via stdin.' },
            cmd
          );
          process.exit(EXIT_INVALID_INPUT);
        }

        await requireConfirmation(`Reply to message ${messageId}`, cmd);

        const client = await createGmailClient(cmd);
        const result = await client.reply(messageId, body);

        output(
          { data: result },
          chalk.green(`Reply sent (id: ${result.id})`),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
