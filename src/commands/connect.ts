import type { Command } from 'commander';
import chalk from 'chalk';
import { requireConfig, resolveBrowser, resolveCallbackPort } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_AUTH_REQUIRED, EXIT_GENERAL, EXIT_INVALID_INPUT } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { runConnectedAccountFlow, listConnectedAccounts } from '../auth/connected-accounts.js';
import { exchangeForConnectionToken } from '../auth/token-exchange.js';
import { log, logError } from '../utils/logger.js';
import { getServiceEntry, getAvailableServices } from '../utils/service-registry.js';

export function registerConnectCommand(program: Command) {
  program
    .command('connect <service>')
    .description('Connect a third-party service (e.g. gmail)')
    .action(async (service: string, opts, cmd: Command) => {
      const serviceLower = service.toLowerCase();
      const mapping = getServiceEntry(serviceLower);

      if (!mapping) {
        outputError(
          {
            code: 'invalid_service',
            message: `Unknown service: ${service}. Available: ${getAvailableServices().join(', ')}`,
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

        // Build scopes: always include full registry scopes for the target service,
        // plus any already-approved remote scopes (from sibling services on the same connection).
        let scopes = [...mapping.scopes];
        try {
          const remoteAccounts = await listConnectedAccounts(config, auth0Tokens.refreshToken);
          const existing = remoteAccounts.find((a) => a.connection === mapping.connection);
          if (existing?.scopes.length) {
            scopes = [...new Set([...scopes, ...existing.scopes])];
            log('merged existing remote scopes for %s: %o', mapping.connection, scopes);
          }
        } catch (err) {
          log(
            'failed to fetch existing remote scopes, proceeding with service scopes only: %s',
            err instanceof Error ? err.message : err
          );
        }

        // Progress message to stderr (human mode only — never to JSON stdout)
        process.stderr.write(`Connecting ${serviceLower}... Opening browser for authorization.\n`);

        const globals = cmd.optsWithGlobals();
        const browser = resolveBrowser(globals.browser);
        const port = resolveCallbackPort(globals.port);

        // Use Connected Accounts API (My Account API) to properly link the
        // external account and store its tokens in Auth0 Token Vault.
        const result = await runConnectedAccountFlow({
          config,
          refreshToken: auth0Tokens.refreshToken,
          connection: mapping.connection,
          scopes,
          browser,
          port,
        });

        // Immediately exchange for a connection token to validate the link
        let warning: string | undefined;
        try {
          await exchangeForConnectionToken(config, store, mapping.connection);
        } catch (exchangeErr) {
          logError('Token exchange after connect failed', exchangeErr);
          warning = exchangeErr instanceof Error ? exchangeErr.message : String(exchangeErr);
          process.stderr.write(chalk.yellow(`Warning: Token exchange failed — ${warning}\n`));
        }

        // Single JSON-safe output with full result
        output(
          {
            status: warning ? 'connected_with_warning' : 'connected',
            service: serviceLower,
            connection: result.connection,
            id: result.id,
            scopes: result.scopes,
            ...(warning ? { warning } : {}),
          },
          warning
            ? chalk.yellow(`Connected ${serviceLower} with warning: ${warning}`)
            : chalk.green(`Successfully connected ${serviceLower}!`),
          cmd
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        outputError({ code: 'connect_failed', message }, cmd);
        process.exit(EXIT_GENERAL);
      }
    });
}
