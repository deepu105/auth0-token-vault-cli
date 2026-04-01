import type { Command } from 'commander';
import chalk from 'chalk';
import { resolveBrowser, resolveCallbackPort } from '../utils/config.js';
import { resolveConfigWithPrompts } from '../utils/prompt.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_GENERAL, EXIT_NETWORK_ERROR, isNetworkError } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { runPkceFlow } from '../auth/pkce-flow.js';
import type { StoredConfig } from '../store/types.js';

/**
 * Core login logic shared by `login` and `init` commands.
 * Resolves config, runs PKCE flow, and persists credentials.
 */
export async function runLogin(options: {
  existing?: StoredConfig | null;
  browser?: string;
  port?: number;
}): Promise<{ reauthenticated: boolean }> {
  const store = new CredentialStore();

  const config = await resolveConfigWithPrompts(options.existing);

  await store.saveConfig({
    domain: config.domain,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    audience: config.audience,
  });

  const existingToken = await store.getAuth0Token();
  const reauthenticated = Boolean(existingToken);

  const tokens = await runPkceFlow({
    config,
    browser: options.browser,
    port: options.port,
  });

  await store.saveAuth0Tokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });

  return { reauthenticated };
}

export function registerLoginCommand(program: Command) {
  program
    .command('login')
    .description('Authenticate with Auth0 via browser-based PKCE flow')
    .option('--reconfigure', 'Re-prompt for Auth0 domain, client ID, and secret')
    .action(async (opts, cmd: Command) => {
      try {
        const store = new CredentialStore();
        const existing = opts.reconfigure ? null : await store.getConfig();

        const globals = cmd.optsWithGlobals();
        const browser = resolveBrowser(globals.browser);
        const port = resolveCallbackPort(globals.port);

        const { reauthenticated } = await runLogin({ existing, browser, port });

        output(
          {
            status: 'logged_in',
            ...(reauthenticated ? { reauthenticated: true } : {}),
          },
          reauthenticated
            ? chalk.green('Successfully re-authenticated!')
            : chalk.green('Successfully logged in!'),
          cmd
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (isNetworkError(message)) {
          outputError({ code: 'network_error', message }, cmd);
          process.exit(EXIT_NETWORK_ERROR);
        }

        outputError({ code: 'login_failed', message }, cmd);
        process.exit(EXIT_GENERAL);
      }
    });
}
