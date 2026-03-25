import type { Command } from 'commander';
import chalk from 'chalk';
import { requireConfig } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_AUTH_REQUIRED, EXIT_GENERAL, EXIT_INVALID_INPUT } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { runPkceFlow } from '../auth/pkce-flow.js';
import { exchangeForConnectionToken } from '../auth/token-exchange.js';
import { logError } from '../utils/logger.js';

/** Map user-friendly service names to Auth0 connection identifiers and scopes */
const SERVICE_MAP: Record<string, { connection: string; connectionScope: string }> = {
  gmail: {
    connection: 'google-oauth2',
    connectionScope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.labels',
    ].join(' '),
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

        // Must be logged in first
        const auth0Token = await store.getAuth0Token();
        if (!auth0Token) {
          outputError(
            { code: 'auth_required', message: 'Not logged in. Run `auth0-tv login` first.' },
            cmd
          );
          process.exit(EXIT_AUTH_REQUIRED);
        }

        output(
          { status: 'connecting', service: serviceLower },
          `Connecting ${chalk.cyan(serviceLower)}... Opening browser for authorization.`,
          cmd
        );

        const tokens = await runPkceFlow({
          config,
          connection: mapping.connection,
          connectionScope: mapping.connectionScope,
          extraParams: { access_type: 'offline', prompt: 'consent' },
        });

        // Save updated Auth0 tokens from the connect flow
        await store.saveAuth0Tokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        });

        // Immediately exchange for a connection token to validate and persist the connection
        let exchangeFailed = false;
        try {
          await exchangeForConnectionToken(config, store, mapping.connection);
        } catch (exchangeErr) {
          exchangeFailed = true;
          logError(
            'Token exchange after connect failed (connection may still work)',
            exchangeErr
          );
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
