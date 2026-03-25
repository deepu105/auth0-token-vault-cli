import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { createGmailClient, handleGmailError, requireConfirmation } from './helpers.js';

export function registerArchiveCommand(gmail: Command) {
  gmail
    .command('archive <messageId>')
    .description('Archive a message (remove from inbox)')
    .action(async (messageId: string, _opts, cmd: Command) => {
      try {
        await requireConfirmation(`Archive message ${messageId}`, cmd);

        const client = await createGmailClient(cmd);
        await client.archive(messageId);

        output(
          { status: 'archived', messageId },
          chalk.green(`Message ${messageId} archived.`),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
