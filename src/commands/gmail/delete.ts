import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withGmailAction, requireConfirmation } from './helpers.js';

export function registerDeleteCommand(gmail: Command) {
  gmail
    .command('delete <messageId>')
    .description('Delete a message (move to trash)')
    .action(
      withGmailAction(async (client, [messageId], _opts, cmd) => {
        await requireConfirmation(`Delete message ${messageId}`, cmd);
        await client.deleteMessage(messageId);
        output(
          { status: 'deleted', messageId },
          chalk.green(`Message ${messageId} moved to trash.`),
          cmd
        );
      })
    );
}
