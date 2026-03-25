import type { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_GENERAL, EXIT_NETWORK_ERROR } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { runPkceFlow } from '../auth/pkce-flow.js';

export function registerLoginCommand(program: Command) {
  program
    .command('login')
    .description('Authenticate with Auth0 via browser-based PKCE flow')
    .action(async (_opts, cmd: Command) => {
      try {
        const config = await loadConfig();
        const store = new CredentialStore();

        const existing = await store.getAuth0Token();
        if (existing) {
          output(
            { status: 'already_logged_in' },
            `${chalk.yellow('Already logged in.')} Re-authenticating...`,
            cmd
          );
        }

        const tokens = await runPkceFlow({ config });

        await store.saveAuth0Tokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        });

        output({ status: 'logged_in' }, chalk.green('Successfully logged in!'), cmd);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
          outputError({ code: 'network_error', message }, cmd);
          process.exit(EXIT_NETWORK_ERROR);
        }

        outputError({ code: 'login_failed', message }, cmd);
        process.exit(EXIT_GENERAL);
      }
    });
}
