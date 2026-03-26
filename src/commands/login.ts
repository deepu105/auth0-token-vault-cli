import type { Command } from 'commander';
import chalk from 'chalk';
import { type Auth0Config, resolveBrowser } from '../utils/config.js';
import { resolveConfigWithPrompts } from '../utils/prompt.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_GENERAL, EXIT_NETWORK_ERROR } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { runPkceFlow } from '../auth/pkce-flow.js';

export function registerLoginCommand(program: Command) {
  program
    .command('login')
    .description('Authenticate with Auth0 via browser-based PKCE flow')
    .option('--reconfigure', 'Re-prompt for Auth0 domain, client ID, and secret')
    .action(async (opts, cmd: Command) => {
      try {
        const store = new CredentialStore();

        // Resolve config: each field checked against env var, then store, then prompt
        const existing = opts.reconfigure ? null : await store.getConfig();
        const config = await resolveConfigWithPrompts(existing);

        // Persist resolved config to the store (unless all fields came from env)
        await store.saveConfig({
          domain: config.domain,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          audience: config.audience,
        });

        const existingToken = await store.getAuth0Token();
        if (existingToken) {
          output(
            { status: 'already_logged_in' },
            `${chalk.yellow('Already logged in.')} Re-authenticating...`,
            cmd
          );
        }

        const globals = cmd.optsWithGlobals();
        const browser = resolveBrowser(globals.browser);
        const tokens = await runPkceFlow({ config, browser });

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
