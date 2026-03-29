import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { withGitHubAction } from './helpers.js';
import {
  formatSearchRepoResults,
  formatSearchCodeResults,
  formatSearchIssueResults,
} from '../../services/github/formatters.js';

export function registerSearchCommand(github: Command) {
  const search = github.command('search').description('Search GitHub');

  search
    .command('repos <query>')
    .description('Search repositories')
    .option('-n, --limit <n>', 'Maximum results to return', '20')
    .option('--sort <field>', 'Sort by field (stars/forks/updated)')
    .action(
      withGitHubAction(async (client, [query], opts, cmd) => {
        const result = await client.searchRepos(query, {
          perPage: parseInt(opts.limit, 10),
          sort: opts.sort,
        });
        output({ data: result }, formatSearchRepoResults(result), cmd);
      })
    );

  search
    .command('code <query>')
    .description('Search code')
    .option('-n, --limit <n>', 'Maximum results to return', '20')
    .action(
      withGitHubAction(async (client, [query], opts, cmd) => {
        const result = await client.searchCode(query, {
          perPage: parseInt(opts.limit, 10),
        });
        output({ data: result }, formatSearchCodeResults(result), cmd);
      })
    );

  search
    .command('issues <query>')
    .description('Search issues and pull requests')
    .option('-n, --limit <n>', 'Maximum results to return', '20')
    .option('--sort <field>', 'Sort by field (created/updated/comments)')
    .action(
      withGitHubAction(async (client, [query], opts, cmd) => {
        const result = await client.searchIssues(query, {
          perPage: parseInt(opts.limit, 10),
          sort: opts.sort,
        });
        output({ data: result }, formatSearchIssueResults(result), cmd);
      })
    );
}
