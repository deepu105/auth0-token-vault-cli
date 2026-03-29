import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatLabelList } from '../../services/gmail/formatters.js';
import { splitCommaList } from '../../utils/format-helpers.js';
import { withGmailAction } from './helpers.js';

export function registerLabelCommands(gmail: Command) {
  gmail
    .command('labels')
    .description('List labels')
    .action(
      withGmailAction(async (client, _args, _opts, cmd) => {
        const labels = await client.listLabels();
        output({ data: labels }, formatLabelList(labels), cmd);
      })
    );

  gmail
    .command('label <messageId>')
    .description('Add or remove labels from a message')
    .option('--add <labels>', 'Comma-separated label IDs to add')
    .option('--remove <labels>', 'Comma-separated label IDs to remove')
    .action(
      withGmailAction(async (client, [messageId], opts, cmd) => {
        const addIds = splitCommaList(opts.add);
        const removeIds = splitCommaList(opts.remove);
        await client.modifyLabels(messageId, addIds, removeIds);
        output(
          { status: 'modified', messageId, added: addIds, removed: removeIds },
          `Labels updated for message ${messageId}.`,
          cmd
        );
      })
    );
}
