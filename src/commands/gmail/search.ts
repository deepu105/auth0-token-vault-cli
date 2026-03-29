import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatSearchResult } from '../../services/gmail/formatters.js';
import { withGmailAction } from './helpers.js';

export function registerSearchCommand(gmail: Command) {
  gmail
    .command('search <query>')
    .description('Search messages')
    .option('-n, --max-results <n>', 'Maximum results to return', '10')
    .option('--page-token <token>', 'Page token for pagination')
    .action(
      withGmailAction(async (client, [query], opts, cmd) => {
        const result = await client.search(query, parseInt(opts.maxResults, 10), opts.pageToken);
        output({ data: result }, formatSearchResult(result), cmd);
      })
    );
}
