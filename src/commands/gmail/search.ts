import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatSearchResult } from '../../services/gmail/formatters.js';
import { createGmailClient, handleGmailError } from './helpers.js';

export function registerSearchCommand(gmail: Command) {
  gmail
    .command('search <query>')
    .description('Search messages')
    .option('-n, --max-results <n>', 'Maximum results to return', '10')
    .option('--page-token <token>', 'Page token for pagination')
    .action(async (query: string, opts, cmd: Command) => {
      try {
        const client = await createGmailClient(cmd);
        const result = await client.search(query, parseInt(opts.maxResults, 10), opts.pageToken);
        output(
          { data: result },
          formatSearchResult(result),
          cmd
        );
      } catch (err) {
        handleGmailError(err, cmd);
      }
    });
}
