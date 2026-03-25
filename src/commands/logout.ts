import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../utils/output.js';
import { EXIT_GENERAL } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';

export function registerLogoutCommand(program: Command) {
  program
    .command('logout')
    .description('Clear all stored credentials and disconnect all services')
    .action(async (_opts, cmd: Command) => {
      try {
        const store = new CredentialStore();

        const existing = await store.getAuth0Tokens();
        if (!existing) {
          output({ status: 'not_logged_in' }, 'Not logged in.', cmd);
          return;
        }

        await store.clear();

        output(
          { status: 'logged_out' },
          chalk.green('Logged out. All credentials and connections have been removed.'),
          cmd
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        outputError({ code: 'logout_failed', message }, cmd);
        process.exit(EXIT_GENERAL);
      }
    });
}
