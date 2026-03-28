import type { Command } from 'commander';
import { output, outputError } from '../../utils/output.js';
import { createGitHubClient, handleGitHubError, parseOwnerRepo } from './helpers.js';
import { formatRepoList, formatRepo } from '../../services/github/formatters.js';
import { EXIT_INVALID_INPUT } from '../../utils/exit-codes.js';

export function registerReposCommand(github: Command) {
  github
    .command('repos')
    .description('List your GitHub repositories')
    .option('-n, --limit <n>', 'Maximum repos to return', '30')
    .option('--sort <field>', 'Sort by field (created/updated/pushed/full_name)', 'updated')
    .option('--type <type>', 'Filter by type (all/owner/member)', 'owner')
    .action(async (opts, cmd: Command) => {
      try {
        const client = await createGitHubClient(cmd);
        const repos = await client.listRepos({
          perPage: parseInt(opts.limit, 10),
          sort: opts.sort,
          type: opts.type,
        });
        output({ data: { repos } }, formatRepoList(repos), cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });
}

export function registerRepoCommand(github: Command) {
  github
    .command('repo <owner/repo>')
    .description('Get details of a GitHub repository')
    .action(async (ownerRepo: string, _opts, cmd: Command) => {
      const parsed = parseOwnerRepo(ownerRepo);
      if (!parsed) {
        outputError(
          {
            code: 'invalid_input',
            message: 'Invalid format. Expected owner/repo.',
          },
          cmd
        );
        process.exit(EXIT_INVALID_INPUT);
      }

      const { owner, repo } = parsed;

      try {
        const client = await createGitHubClient(cmd);
        const repoData = await client.getRepo(owner, repo);
        output({ data: repoData }, formatRepo(repoData), cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });
}
