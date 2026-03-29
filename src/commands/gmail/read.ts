import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatEmailFull } from '../../services/gmail/formatters.js';
import { withGmailAction } from './helpers.js';

export function registerReadCommand(gmail: Command) {
  gmail
    .command('read <messageId>')
    .description('Read a message')
    .action(
      withGmailAction(async (client, [messageId], _opts, cmd) => {
        const email = await client.read(messageId);
        output({ data: email }, formatEmailFull(email), cmd);
      })
    );
}
