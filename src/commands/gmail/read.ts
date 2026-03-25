import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatEmailFull } from '../../services/gmail/formatters.js';
import { createGmailClient, handleGmailError } from './helpers.js';

export function registerReadCommand(gmail: Command) {
  gmail
    .command('read <messageId>')
    .description('Read a message')
    .action(async (messageId: string, _opts, cmd: Command) => {
      try {
        const client = await createGmailClient(cmd);
        const email = await client.read(messageId);
        output(
          { data: email },
          formatEmailFull(email),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
