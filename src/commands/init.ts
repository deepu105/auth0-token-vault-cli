import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { resolveBrowser, resolveCallbackPort } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_GENERAL } from '../utils/exit-codes.js';
import { CALLBACK_PORTS } from '../auth/browser.js';
import { runLogin } from './login.js';
import { configureTokenVault } from './init/configure-token-vault.js';

export function registerInitCommand(program: Command) {
  program
    .command('init')
    .description('Interactive guided setup wizard')
    .option('--app-name <name>', 'Application name (skips interactive prompt, creates new app)')
    .option('--app-id <id>', 'Use an existing application by client ID')
    .action(async (opts, cmd: Command) => {
      try {
        if (!process.stdin.isTTY && !process.env.AUTH0_TV_FORCE_INTERACTIVE) {
          throw new Error('The init command requires an interactive terminal.');
        }

        p.intro('Auth0 Token Vault CLI — Setup Wizard');

        // Step 1: Configure Token Vault
        p.log.step('Step 1: Configure Auth0 Token Vault');

        const callbacks = CALLBACK_PORTS.map((port) => `http://127.0.0.1:${port}/callback`);
        const logoutUrls = CALLBACK_PORTS.map((port) => `http://127.0.0.1:${port}`);

        const nonInteractive = !process.stdin.isTTY;
        const { clientId, clientSecret, domain } = await configureTokenVault({
          callbackUrls: callbacks,
          logoutUrls,
          appName: opts.appName,
          appId: opts.appId,
          skipConnections: nonInteractive,
        });

        p.log.success(`Credentials retrieved.\n  Domain:    ${domain}\n  Client ID: ${clientId}`);

        // Step 2: Login
        p.log.step('Step 2: Authenticate');

        process.env.AUTH0_DOMAIN = domain;
        process.env.AUTH0_CLIENT_ID = clientId;
        process.env.AUTH0_CLIENT_SECRET = clientSecret;

        const globals = cmd.optsWithGlobals();
        const browser = resolveBrowser(globals.browser);
        const port = resolveCallbackPort(globals.port);

        await runLogin({ existing: null, browser, port });

        // Done
        p.note(
          'Connect a provider:\n' +
            '  auth0-tv connect gmail\n' +
            '  auth0-tv connect github\n' +
            '  auth0-tv connect slack\n\n' +
            'Make authenticated API calls:\n' +
            '  auth0-tv fetch gmail https://gmail.googleapis.com/gmail/v1/users/me/messages\n\n' +
            'Check status:\n' +
            '  auth0-tv status',
          'Next steps'
        );

        p.outro('Setup complete!');
        output({ status: 'setup_complete' }, '', cmd);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        outputError({ code: 'init_failed', message }, cmd);
        process.exit(EXIT_GENERAL);
      }
    });
}
