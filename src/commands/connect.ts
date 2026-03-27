import type { Command } from 'commander';
import chalk from 'chalk';
import { requireConfig, resolveBrowser } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_AUTH_REQUIRED, EXIT_GENERAL, EXIT_INVALID_INPUT } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { runConnectedAccountFlow } from '../auth/connected-accounts.js';
import { exchangeForConnectionToken } from '../auth/token-exchange.js';
import { logError } from '../utils/logger.js';

/** Map user-friendly service names to Auth0 connection identifiers and scopes */
const SERVICE_MAP: Record<string, { connection: string; scopes: string[] }> = {
  gmail: {
    connection: 'google-oauth2',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.labels',
    ],
  },
};

export function registerConnectCommand(program: Command) {
  program
    .command('connect <service>')
    .description('Connect a third-party service (e.g. gmail)')
    .action(async (service: string, _opts, cmd: Command) => {
      const serviceLower = service.toLowerCase();
      const mapping = SERVICE_MAP[serviceLower];

      if (!mapping) {
        outputError(
          {
            code: 'invalid_service',
            message: `Unknown service: ${service}. Available: ${Object.keys(SERVICE_MAP).join(', ')}`,
          },
          cmd
        );
        process.exit(EXIT_INVALID_INPUT);
      }

      try {
        const store = new CredentialStore();
        const config = await requireConfig(store);

        // Must be logged in first — need refresh token for MRRT exchange
        const auth0Tokens = await store.getAuth0Tokens();
        if (!auth0Tokens?.refreshToken) {
          outputError(
            { code: 'auth_required', message: 'Not logged in. Run `auth0-tv login` first.' },
            cmd
          );
          process.exit(EXIT_AUTH_REQUIRED);
        }

        // Clear any stale cached connection token before re-authorizing
        await store.removeConnection(mapping.connection);

        output(
          { status: 'connecting', service: serviceLower },
          `Connecting ${chalk.cyan(serviceLower)}... Opening browser for authorization.`,
          cmd
        );

        const globals = cmd.optsWithGlobals();
        const browser = resolveBrowser(globals.browser);

        // Use Connected Accounts API (My Account API) to properly link the
        // external account and store its tokens in Auth0 Token Vault.
        const result = await runConnectedAccountFlow({
          config,
          refreshToken: auth0Tokens.refreshToken,
          connection: mapping.connection,
          scopes: mapping.scopes,
          browser,
        });

        output(
          {
            status: 'account_linked',
            id: result.id,
            connection: result.connection,
            scopes: result.scopes,
          },
          chalk.green(`Linked ${serviceLower} account (${result.connection}).`),
          cmd
        );

        // Immediately exchange for a connection token to validate the link
        let exchangeFailed = false;
        try {
          await exchangeForConnectionToken(config, store, mapping.connection);
        } catch (exchangeErr) {
          exchangeFailed = true;
          logError('Token exchange after connect failed', exchangeErr);
          const errMsg = exchangeErr instanceof Error ? exchangeErr.message : String(exchangeErr);
          output(
            { status: 'warning', message: errMsg },
            chalk.yellow(`Warning: Token exchange failed — ${errMsg}`),
            cmd
          );
        }

        if (!exchangeFailed) {
          output(
            { status: 'connected', service: serviceLower, connection: mapping.connection },
            chalk.green(`Successfully connected ${serviceLower}!`),
            cmd
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        outputError({ code: 'connect_failed', message }, cmd);
        process.exit(EXIT_GENERAL);
      }
    });
}
