import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { formatSearchResult } from '../../services/slack/formatters.js';
import { withSlackAction } from './helpers.js';

export function registerSearchCommand(slack: Command) {
  slack
    .command('search <query>')
    .description('Search Slack messages')
    .option('--sort <field>', 'Sort field (timestamp or score)', 'timestamp')
    .option('--sort-dir <dir>', 'Sort direction (asc or desc)', 'desc')
    .option('--count <n>', 'Number of results per page', '20')
    .option('--page <n>', 'Page number', '1')
    .action(
      withSlackAction(async (client, [query], opts, cmd) => {
        const result = await client.searchMessages(query, {
          sort: opts.sort,
          sortDir: opts.sortDir,
          count: parseInt(opts.count, 10),
          page: parseInt(opts.page, 10),
        });
        output({ data: result }, formatSearchResult(result), cmd);
      })
    );
}
