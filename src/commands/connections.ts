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

function formatTokenStatus(status: string): string {
  if (status === 'valid') return chalk.green('valid');
  if (status === 'expired') return chalk.yellow('expired');
  return chalk.dim('none');
}

function formatConnectionLine(e: {
  service: string;
  connection: string;
  tokenStatus: string;
  scopes: string[];
}): string {
  const scopes = e.scopes.length > 0 ? `\n    scopes: ${chalk.dim(e.scopes.join(', '))}` : '';
  return `  ${chalk.cyan(e.service)} (${e.connection}) — local token: ${formatTokenStatus(e.tokenStatus)}${scopes}`;
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

      let entries: {
        connection: string;
        services: string[];
        service: string;
        scopes: string[];
        tokenStatus: string;
        remote: boolean;
        id?: string;
      }[];
      let heading: string;

      if (remoteAccounts) {
        entries = await Promise.all(
          remoteAccounts.map(async (acct) => {
            const localEntry = await store.getConnectionEntry(acct.connection);
            const services = getServicesForConnection(acct.connection);
            return {
              connection: acct.connection,
              services,
              service: services.join(', ') || acct.connection,
              id: acct.id,
              scopes: acct.scopes,
              tokenStatus: localTokenStatus(localEntry),
              remote: true,
            };
          })
        );
        heading = 'Connected services:';
      } else {
        const connections = await store.listConnections();
        entries = await Promise.all(
          connections.map(async (conn) => {
            const entry = await store.getConnectionEntry(conn);
            const services = getServicesForConnection(conn);
            return {
              connection: conn,
              services,
              service: services.join(', ') || conn,
              scopes: entry?.scopes ?? [],
              tokenStatus: localTokenStatus(entry),
              remote: false,
            };
          })
        );
        heading = 'Connected services (local only):';
      }

      if (entries.length === 0) {
        output(
          { connections: [] },
          chalk.yellow('No services connected. Use `auth0-tv connect <service>` to connect one.'),
          cmd
        );
        return;
      }

      const humanLines = entries.map(formatConnectionLine);
      output({ connections: entries }, `${heading}\n${humanLines.join('\n')}`, cmd);
    });
}
