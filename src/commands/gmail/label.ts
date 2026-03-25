import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatLabelList } from '../../services/gmail/formatters.js';
import { createGmailClient, handleGmailError } from './helpers.js';

export function registerLabelCommands(gmail: Command) {
  gmail
    .command('labels')
    .description('List labels')
    .action(async (_opts, cmd: Command) => {
      try {
        const client = await createGmailClient(cmd);
        const labels = await client.listLabels();

        output(
          { data: labels },
          formatLabelList(labels),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });

  gmail
    .command('label <messageId>')
    .description('Add or remove labels from a message')
    .option('--add <labels>', 'Comma-separated label IDs to add')
    .option('--remove <labels>', 'Comma-separated label IDs to remove')
    .action(async (messageId: string, opts, cmd: Command) => {
      try {
        const addIds = opts.add ? opts.add.split(',').map((s: string) => s.trim()) : [];
        const removeIds = opts.remove ? opts.remove.split(',').map((s: string) => s.trim()) : [];

        const client = await createGmailClient(cmd);
        await client.modifyLabels(messageId, addIds, removeIds);

        output(
          { status: 'modified', messageId, added: addIds, removed: removeIds },
          `Labels updated for message ${messageId}.`,
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
