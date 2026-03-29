import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withGmailAction, requireConfirmation } from './helpers.js';

export function registerArchiveCommand(gmail: Command) {
  gmail
    .command('archive <messageId>')
    .description('Archive a message (remove from inbox)')
    .action(
      withGmailAction(async (client, [messageId], _opts, cmd) => {
        await requireConfirmation(`Archive message ${messageId}`, cmd);
        await client.archive(messageId);
        output(
          { status: 'archived', messageId },
          chalk.green(`Message ${messageId} archived.`),
          cmd
        );
      })
    );
}
