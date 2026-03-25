import type { Command } from 'commander';
import chalk from 'chalk';
import { mergeConfigFromEnvAndStore } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_GENERAL } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { openBrowserLogout } from '../auth/browser.js';
import { log } from '../utils/logger.js';

export function registerLogoutCommand(program: Command) {
  program
    .command('logout')
    .description('Clear all stored credentials and disconnect all services')
    .option('--local', 'Only clear local credentials without ending the browser session')
    .action(async (opts, cmd: Command) => {
      try {
        const store = new CredentialStore();

        const existing = await store.getAuth0Tokens();
        if (!existing) {
          output({ status: 'not_logged_in' }, 'Not logged in.', cmd);
          return;
        }

        // Attempt browser logout before clearing local credentials
        if (!opts.local) {
          const stored = await store.getConfig();
          const { domain, clientId } = mergeConfigFromEnvAndStore(stored);

          if (domain && clientId) {
            try {
              await openBrowserLogout(domain, clientId);
            } catch {
              log('failed to open browser for logout, continuing with local cleanup');
            }
          }
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
