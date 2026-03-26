import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../../utils/output.js';
import { EXIT_INVALID_INPUT } from '../../utils/exit-codes.js';
import { formatDraftList } from '../../services/gmail/formatters.js';
import {
  createGmailClient,
  handleGmailError,
  requireConfirmation,
  resolveBody,
} from './helpers.js';

export function registerDraftCommands(gmail: Command) {
  const draft = gmail.command('draft').description('Draft commands (create, list, send, delete)');

  draft
    .command('create')
    .description('Create a new draft')
    .requiredOption('--to <address>', 'Recipient email address')
    .requiredOption('--subject <subject>', 'Email subject')
    .option('--body <text>', 'Email body text')
    .option('--body-file <path>', 'Read body from file')
    .action(async (opts, cmd: Command) => {
      try {
        const body = await resolveBody(opts);
        if (!body) {
          outputError(
            {
              code: 'missing_body',
              message: 'Draft body required. Use --body, --body-file, or pipe via stdin.',
            },
            cmd
          );
          process.exit(EXIT_INVALID_INPUT);
        }

        const client = await createGmailClient(cmd);
        const result = await client.createDraft(opts.to, opts.subject, body);

        output({ data: result }, chalk.green(`Draft created (id: ${result.id})`), cmd);
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });

  draft
    .command('list')
    .description('List drafts')
    .option('-n, --max-results <n>', 'Maximum results', '20')
    .action(async (opts, cmd: Command) => {
      try {
        const client = await createGmailClient(cmd);
        const drafts = await client.listDrafts(parseInt(opts.maxResults, 10));

        output({ data: drafts }, formatDraftList(drafts), cmd);
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });

  draft
    .command('send <draftId>')
    .description('Send an existing draft')
    .action(async (draftId: string, _opts, cmd: Command) => {
      try {
        await requireConfirmation(`Send draft ${draftId}`, cmd);

        const client = await createGmailClient(cmd);
        const result = await client.sendDraft(draftId);

        output({ data: result }, chalk.green(`Draft sent (id: ${result.id})`), cmd);
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });

  draft
    .command('delete <draftId>')
    .description('Delete a draft')
    .action(async (draftId: string, _opts, cmd: Command) => {
      try {
        await requireConfirmation(`Delete draft ${draftId}`, cmd);

        const client = await createGmailClient(cmd);
        await client.deleteDraft(draftId);

        output({ status: 'deleted', draftId }, chalk.green(`Draft ${draftId} deleted.`), cmd);
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
