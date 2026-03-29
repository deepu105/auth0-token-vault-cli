import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../../utils/output.js';
import { withGitHubAction, requireOwnerRepo, requireConfirmation } from './helpers.js';
import { formatIssueList, formatIssue } from '../../services/github/formatters.js';
import { splitCommaList } from '../../utils/format-helpers.js';

export function registerIssuesCommand(github: Command) {
  github
    .command('issues <ownerRepo>')
    .description('List issues for a GitHub repository')
    .option('--state <state>', 'Filter by state (open/closed/all)', 'open')
    .option('-n, --limit <n>', 'Maximum issues to return', '30')
    .option('--labels <labels>', 'Comma-separated label filter')
    .action(
      withGitHubAction(async (client, [ownerRepo], opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        const issues = await client.listIssues(owner, repo, {
          state: opts.state,
          perPage: parseInt(opts.limit, 10),
          labels: opts.labels,
        });
        output({ data: { issues } }, formatIssueList(issues), cmd);
      })
    );
}

export function registerIssueCommand(github: Command) {
  const issue = github.command('issue').description('GitHub issue commands');

  // issue get <ownerRepo> <number>
  issue
    .command('get <ownerRepo> <number>')
    .description('Get details of a GitHub issue')
    .action(
      withGitHubAction(async (client, [ownerRepo, number], _opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        const issueData = await client.getIssue(owner, repo, Number(number));
        output({ data: issueData }, formatIssue(issueData), cmd);
      })
    );

  // issue create <ownerRepo>
  issue
    .command('create <ownerRepo>')
    .description('Create a new GitHub issue')
    .requiredOption('--title <title>', 'Issue title')
    .option('--body <body>', 'Issue body')
    .option('--labels <labels>', 'Comma-separated labels')
    .option('--assignees <assignees>', 'Comma-separated assignees')
    .action(
      withGitHubAction(async (client, [ownerRepo], opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        await requireConfirmation('create issue', cmd);
        const labels = splitCommaList(opts.labels);
        const assignees = splitCommaList(opts.assignees);
        const created = await client.createIssue(owner, repo, {
          title: opts.title,
          body: opts.body,
          labels,
          assignees,
        });
        output(
          { data: created },
          chalk.green(`Issue #${created.number} created: ${created.title}`),
          cmd
        );
      })
    );

  // issue comment <ownerRepo> <number>
  issue
    .command('comment <ownerRepo> <number>')
    .description('Add a comment to a GitHub issue')
    .requiredOption('--body <body>', 'Comment body')
    .action(
      withGitHubAction(async (client, [ownerRepo, number], opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        await requireConfirmation('comment on issue', cmd);
        const comment = await client.commentOnIssue(owner, repo, Number(number), opts.body);
        output({ data: comment }, chalk.green(`Comment added to issue #${number}.`), cmd);
      })
    );

  // issue close <ownerRepo> <number>
  issue
    .command('close <ownerRepo> <number>')
    .description('Close a GitHub issue')
    .action(
      withGitHubAction(async (client, [ownerRepo, number], _opts, cmd) => {
        const { owner, repo } = requireOwnerRepo(ownerRepo, cmd);
        await requireConfirmation('close issue', cmd);
        const closed = await client.closeIssue(owner, repo, Number(number));
        output({ data: closed }, chalk.green(`Issue #${number} closed.`), cmd);
      })
    );
}
