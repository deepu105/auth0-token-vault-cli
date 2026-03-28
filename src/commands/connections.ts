import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../utils/output.js';
import { CredentialStore, EXPIRY_BUFFER_MS } from '../store/credential-store.js';
import { listConnectedAccounts } from '../auth/connected-accounts.js';
import { requireConfig } from '../utils/config.js';
import { logError } from '../utils/logger.js';
import { getServicesForConnection } from '../utils/service-registry.js';

function localTokenStatus(entry: { expiresAt: number } | null): 'valid' | 'expired' | 'none' {
  if (!entry) return 'none';
  return Date.now() >= entry.expiresAt - EXPIRY_BUFFER_MS ? 'expired' : 'valid';
}

export function registerConnectionsCommand(program: Command) {
  program
    .command('connections')
    .description('List connected services')
    .action(async (_opts, cmd: Command) => {
      const store = new CredentialStore();

      // Try to fetch remote connected accounts if logged in
      let remoteAccounts: { id: string; connection: string; scopes: string[] }[] | null = null;
      try {
        const config = await requireConfig(store);
        const auth0Tokens = await store.getAuth0Tokens();
        if (auth0Tokens?.refreshToken) {
          remoteAccounts = await listConnectedAccounts(config, auth0Tokens.refreshToken);
        }
      } catch (err) {
        logError('Failed to fetch remote connections, falling back to local', err);
      }

      if (remoteAccounts) {
        // Remote-first: show all remote accounts with local token status
        if (remoteAccounts.length === 0) {
          output(
            { connections: [] },
            chalk.yellow('No services connected. Use `auth0-tv connect <service>` to connect one.'),
            cmd
          );
          return;
        }

        const entries = await Promise.all(
          remoteAccounts.map(async (acct) => {
            const localEntry = await store.getConnectionEntry(acct.connection);
            const status = localTokenStatus(localEntry);
            return {
              connection: acct.connection,
              services: getServicesForConnection(acct.connection),
              service: getServicesForConnection(acct.connection).join(', ') || acct.connection,
              id: acct.id,
              scopes: acct.scopes,
              tokenStatus: status,
              remote: true,
            };
          })
        );

        const humanLines = entries.map((e) => {
          const tokenLabel =
            e.tokenStatus === 'valid'
              ? chalk.green('valid')
              : e.tokenStatus === 'expired'
                ? chalk.yellow('expired')
                : chalk.dim('none');
          return `  ${chalk.cyan(e.service)} (${e.connection}) — local token: ${tokenLabel}`;
        });

        output({ connections: entries }, `Connected services:\n${humanLines.join('\n')}`, cmd);
      } else {
        // Fallback: local-only (not logged in or remote call failed)
        const connections = await store.listConnections();

        if (connections.length === 0) {
          output(
            { connections: [] },
            chalk.yellow('No services connected. Use `auth0-tv connect <service>` to connect one.'),
            cmd
          );
          return;
        }

        const entries = await Promise.all(
          connections.map(async (conn) => {
            const entry = await store.getConnectionEntry(conn);
            const status = localTokenStatus(entry);
            return {
              connection: conn,
              services: getServicesForConnection(conn),
              service: getServicesForConnection(conn).join(', ') || conn,
              scopes: entry?.scopes ?? [],
              tokenStatus: status,
              remote: false,
            };
          })
        );

        const humanLines = entries.map((e) => {
          const tokenLabel =
            e.tokenStatus === 'valid' ? chalk.green('valid') : chalk.yellow('expired');
          return `  ${chalk.cyan(e.service)} (${e.connection}) — local token: ${tokenLabel}`;
        });

        output(
          { connections: entries },
          `Connected services (local only):\n${humanLines.join('\n')}`,
          cmd
        );
      }
    });
}
