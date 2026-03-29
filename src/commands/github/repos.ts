import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { withGitHubAction, requireOwnerRepo } from './helpers.js';
import { formatRepoList, formatRepo } from '../../services/github/formatters.js';

export function registerReposCommand(github: Command) {
  github
    .command('repos')
    .description('List your GitHub repositories')
    .option('-n, --limit <n>', 'Maximum repos to return', '30')
    .option('--sort <field>', 'Sort by field (created/updated/pushed/full_name)', 'updated')
    .option('--type <type>', 'Filter by type (all/owner/member)', 'owner')
    .action(
      withGitHubAction(async (client, _args, opts, cmd) => {
        const repos = await client.listRepos({
          perPage: parseInt(opts.limit, 10),
          sort: opts.sort,
          type: opts.type,
        });
        output({ data: { repos } }, formatRepoList(repos), cmd);
      })
    );
}

export function registerRepoCommand(github: Command) {
  github
    .command('repo <owner/repo>')
    .description('Get details of a GitHub repository')
    .action(
      withGitHubAction(async (client, [ownerRepo], _opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        const repoData = await client.getRepo(owner, repo);
        output({ data: repoData }, formatRepo(repoData), cmd);
      })
    );
}
