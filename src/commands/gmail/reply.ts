import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import {
  createGmailClient,
  handleGmailError,
  requireBody,
  requireConfirmation,
} from './helpers.js';

export function registerReplyCommand(gmail: Command) {
  gmail
    .command('reply <messageId>')
    .description('Reply to a message')
    .option('--body <text>', 'Reply body text')
    .option('--body-file <path>', 'Read body from file')
    .action(async (messageId: string, opts, cmd: Command) => {
      try {
        const body = await requireBody(opts, 'Reply body', cmd);

        await requireConfirmation(`Reply to message ${messageId}`, cmd);

        const client = await createGmailClient(cmd);
        const result = await client.reply(messageId, body);

        output({ data: result }, chalk.green(`Reply sent (id: ${result.id})`), cmd);
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
