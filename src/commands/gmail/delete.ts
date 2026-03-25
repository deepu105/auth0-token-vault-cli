import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { createGmailClient, handleGmailError, requireConfirmation } from './helpers.js';

export function registerDeleteCommand(gmail: Command) {
  gmail
    .command('delete <messageId>')
    .description('Delete a message (move to trash)')
    .action(async (messageId: string, _opts, cmd: Command) => {
      try {
        await requireConfirmation(`Delete message ${messageId}`, cmd);

        const client = await createGmailClient(cmd);
        await client.deleteMessage(messageId);

        output(
          { status: 'deleted', messageId },
          chalk.green(`Message ${messageId} moved to trash.`),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
