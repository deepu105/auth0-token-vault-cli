import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { formatDraftList } from '../../services/gmail/formatters.js';
import { withGmailAction, requireBody, requireConfirmation } from './helpers.js';

export function registerDraftCommands(gmail: Command) {
  const draft = gmail.command('draft').description('Draft commands (create, list, send, delete)');

  draft
    .command('create')
    .description('Create a new draft')
    .requiredOption('--to <address>', 'Recipient email address')
    .requiredOption('--subject <subject>', 'Email subject')
    .option('--body <text>', 'Email body text')
    .option('--body-file <path>', 'Read body from file')
    .action(
      withGmailAction(async (client, _args, opts, cmd) => {
        const body = await requireBody(opts, 'Draft body', cmd);
        const result = await client.createDraft(opts.to, opts.subject, body);
        output({ data: result }, chalk.green(`Draft created (id: ${result.id})`), cmd);
      })
    );

  draft
    .command('list')
    .description('List drafts')
    .option('-n, --max-results <n>', 'Maximum results', '20')
    .action(
      withGmailAction(async (client, _args, opts, cmd) => {
        const drafts = await client.listDrafts(parseInt(opts.maxResults, 10));
        output({ data: drafts }, formatDraftList(drafts), cmd);
      })
    );

  draft
    .command('send <draftId>')
    .description('Send an existing draft')
    .action(
      withGmailAction(async (client, [draftId], _opts, cmd) => {
        await requireConfirmation(`Send draft ${draftId}`, cmd);
        const result = await client.sendDraft(draftId);
        output({ data: result }, chalk.green(`Draft sent (id: ${result.id})`), cmd);
      })
    );

  draft
    .command('delete <draftId>')
    .description('Delete a draft')
    .action(
      withGmailAction(async (client, [draftId], _opts, cmd) => {
        await requireConfirmation(`Delete draft ${draftId}`, cmd);
        await client.deleteDraft(draftId);
        output({ status: 'deleted', draftId }, chalk.green(`Draft ${draftId} deleted.`), cmd);
      })
    );
}
