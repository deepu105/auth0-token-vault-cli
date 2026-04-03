import type { Command } from 'commander';
import chalk from 'chalk';
import { requireConfig, resolveBrowser, resolveCallbackPort } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_AUTH_REQUIRED, EXIT_GENERAL } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { runConnectedAccountFlow, listConnectedAccounts } from '../auth/connected-accounts.js';
import { exchangeForConnectionToken } from '../auth/token-exchange.js';
import { log, logError } from '../utils/logger.js';
import { resolveService } from '../utils/service-registry.js';

export function registerConnectCommand(program: Command) {
  program
    .command('connect <service>')
    .description(
      'Connect a third-party service (e.g. gmail) or any Auth0 connection by name (e.g. google-oauth2)'
    )
    .option(
      '--allowed-domains <domains>',
      'Comma-separated domains allowed for `auth0-tv fetch` (e.g. api.github.com,api.slack.com)'
    )
    .option(
      '--scopes <scopes>',
      'Comma-separated extra scopes to request (merged with service defaults)'
    )
    .action(async (service: string, opts, cmd: Command) => {
      const serviceLower = service.toLowerCase();
      const resolved = resolveService(serviceLower);

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
        await store.removeConnection(resolved.connection);

        // Build scopes: include registry defaults (empty for custom services),
        // plus any already-approved remote scopes (from sibling services on the same connection),
        // plus any extra scopes provided via --scopes.
        const extraScopes = opts.scopes
          ? opts.scopes
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];
        let scopes = [...new Set([...resolved.scopes, ...extraScopes])];
        try {
          const remoteAccounts = await listConnectedAccounts(config, auth0Tokens.refreshToken);
          const existing = remoteAccounts.find((a) => a.connection === resolved.connection);
          if (existing?.scopes.length) {
            scopes = [...new Set([...scopes, ...existing.scopes])];
            log('merged existing remote scopes for %s: %o', resolved.connection, scopes);
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
          connection: resolved.connection,
          scopes,
          browser,
          port,
        });

        // Immediately exchange for a connection token to validate the link
        let warning: string | undefined;
        try {
          await exchangeForConnectionToken(config, store, resolved.connection);
        } catch (exchangeErr) {
          logError('Token exchange after connect failed', exchangeErr);
          warning = exchangeErr instanceof Error ? exchangeErr.message : String(exchangeErr);
          process.stderr.write(chalk.yellow(`Warning: Token exchange failed — ${warning}\n`));
        }

        // Save allowed domains if provided
        if (opts.allowedDomains) {
          const domains = opts.allowedDomains
            .split(',')
            .map((d: string) => d.trim().toLowerCase())
            .filter(Boolean);
          if (domains.length > 0) {
            const existing = await store.getServiceSettings(serviceLower);
            await store.saveServiceSettings(serviceLower, {
              ...existing,
              allowedDomains: domains,
            });
            log('saved allowed domains for %s: %o', serviceLower, domains);
          }
        }

        // Single JSON-safe output with full result
        const settings = await store.getServiceSettings(serviceLower);
        output(
          {
            status: warning ? 'connected_with_warning' : 'connected',
            service: serviceLower,
            connection: result.connection,
            id: result.id,
            scopes: result.scopes,
            ...(settings?.allowedDomains?.length
              ? { allowedDomains: settings.allowedDomains }
              : {}),
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
