import type { Command } from 'commander';
import { output } from '../../utils/output.js';
import { withGitHubAction, requireOwnerRepo, requireConfirmation } from './helpers.js';
import { formatPRList, formatPR } from '../../services/github/formatters.js';

export function registerPRsCommand(github: Command) {
  github
    .command('prs <ownerRepo>')
    .description('List pull requests for a repository')
    .option('--state <state>', 'Filter by state (open/closed/all)', 'open')
    .option('-n, --limit <n>', 'Maximum pull requests to return', '30')
    .action(
      withGitHubAction(async (client, [ownerRepo], opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        const pullRequests = await client.listPullRequests(owner, repo, {
          state: opts.state,
          perPage: parseInt(opts.limit, 10),
        });
        output({ data: { pullRequests } }, formatPRList(pullRequests), cmd);
      })
    );
}

export function registerPRCommand(github: Command) {
  const pr = github.command('pr').description('Manage pull requests');

  pr.command('get <ownerRepo> <number>')
    .description('Get details of a pull request')
    .action(
      withGitHubAction(async (client, [ownerRepo, number], _opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        const prData = await client.getPullRequest(owner, repo, Number(number));
        output({ data: prData }, formatPR(prData), cmd);
      })
    );

  pr.command('comment <ownerRepo> <number>')
    .description('Add a comment to a pull request')
    .requiredOption('--body <text>', 'Comment body text')
    .action(
      withGitHubAction(async (client, [ownerRepo, number], opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        await requireConfirmation('comment on PR', cmd);
        const comment = await client.commentOnPR(owner, repo, Number(number), opts.body);
        output({ data: comment }, 'Comment added', cmd);
      })
    );
}
