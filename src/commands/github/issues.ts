import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../../utils/output.js';
import {
  createGitHubClient,
  handleGitHubError,
  parseOwnerRepo,
  requireConfirmation,
} from './helpers.js';
import {
  formatIssueList,
  formatIssue,
  formatCommentList,
} from '../../services/github/formatters.js';
import { EXIT_INVALID_INPUT } from '../../utils/exit-codes.js';

export function registerIssuesCommand(github: Command) {
  github
    .command('issues <ownerRepo>')
    .description('List issues for a GitHub repository')
    .option('--state <state>', 'Filter by state (open/closed/all)', 'open')
    .option('-n, --limit <n>', 'Maximum issues to return', '30')
    .option('--labels <labels>', 'Comma-separated label filter')
    .action(async (ownerRepo: string, opts, cmd: Command) => {
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
        const issues = await client.listIssues(owner, repo, {
          state: opts.state,
          perPage: parseInt(opts.limit, 10),
          labels: opts.labels,
        });
        output({ data: { issues } }, formatIssueList(issues), cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });
}

export function registerIssueCommand(github: Command) {
  const issue = github.command('issue').description('GitHub issue commands');

  // issue get <ownerRepo> <number>
  issue
    .command('get <ownerRepo> <number>')
    .description('Get details of a GitHub issue')
    .action(async (ownerRepo: string, number: string, _opts, cmd: Command) => {
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
        const issueData = await client.getIssue(owner, repo, Number(number));
        output({ data: issueData }, formatIssue(issueData), cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });

  // issue create <ownerRepo>
  issue
    .command('create <ownerRepo>')
    .description('Create a new GitHub issue')
    .requiredOption('--title <title>', 'Issue title')
    .option('--body <body>', 'Issue body')
    .option('--labels <labels>', 'Comma-separated labels')
    .option('--assignees <assignees>', 'Comma-separated assignees')
    .action(async (ownerRepo: string, opts, cmd: Command) => {
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
        await requireConfirmation('create issue', cmd);

        const client = await createGitHubClient(cmd);
        const labels = opts.labels
          ? opts.labels.split(',').map((l: string) => l.trim())
          : undefined;
        const assignees = opts.assignees
          ? opts.assignees.split(',').map((a: string) => a.trim())
          : undefined;

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
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });

  // issue comment <ownerRepo> <number>
  issue
    .command('comment <ownerRepo> <number>')
    .description('Add a comment to a GitHub issue')
    .requiredOption('--body <body>', 'Comment body')
    .action(async (ownerRepo: string, number: string, opts, cmd: Command) => {
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
        await requireConfirmation('comment on issue', cmd);

        const client = await createGitHubClient(cmd);
        const comment = await client.commentOnIssue(owner, repo, Number(number), opts.body);

        output({ data: comment }, chalk.green(`Comment added to issue #${number}.`), cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });

  // issue close <ownerRepo> <number>
  issue
    .command('close <ownerRepo> <number>')
    .description('Close a GitHub issue')
    .action(async (ownerRepo: string, number: string, _opts, cmd: Command) => {
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
        await requireConfirmation('close issue', cmd);

        const client = await createGitHubClient(cmd);
        const closed = await client.closeIssue(owner, repo, Number(number));

        output({ data: closed }, chalk.green(`Issue #${number} closed.`), cmd);
      } catch (err) {
        handleGitHubError(err, cmd);
      }
    });
}
