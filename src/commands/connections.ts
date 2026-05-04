import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../utils/output.js';
import { CredentialStore, EXPIRY_BUFFER_MS } from '../store/credential-store.js';
import { listConnectedAccounts } from '../auth/connected-accounts.js';
import { requireConfig } from '../utils/config.js';
import { logError } from '../utils/logger.js';
import { getServicesForConnection, resolveService } from '../utils/service-registry.js';

/**
 * Merge registry defaults and stored settings to get the allowed domains
 * that `fetch` would honor for this connection. For known connections we
 * iterate each service name (e.g. gmail, calendar for google-oauth2); for
 * custom connections we look up settings stored under the connection name.
 */
async function resolveAllowedDomains(
  store: CredentialStore,
  connection: string,
  services: string[]
): Promise<string[]> {
  const keys = services.length > 0 ? services : [connection];
  const domains = new Set<string>();
  for (const key of keys) {
    for (const d of resolveService(key).allowedDomains) domains.add(d);
    const settings = await store.getServiceSettings(key);
    for (const d of settings?.allowedDomains ?? []) domains.add(d);
  }
  return [...domains];
}

export interface ConnectionEntry {
  connection: string;
  services: string[];
  service: string;
  scopes: string[];
  tokenStatus: string;
  allowedDomains: string[];
  remote: boolean;
  id?: string;
}

export interface ConnectionSummary {
  entries: ConnectionEntry[];
  /** true when remote accounts were fetched; false when falling back to local-only. */
  remote: boolean;
}

function localTokenStatus(entry: { expiresAt: number } | null): 'valid' | 'expired' | 'none' {
  if (!entry) return 'none';
  return Date.now() >= entry.expiresAt - EXPIRY_BUFFER_MS ? 'expired' : 'valid';
}

function formatTokenStatus(status: string): string {
  if (status === 'valid') return chalk.green('valid');
  if (status === 'expired') return chalk.yellow('expired');
  return chalk.dim('none');
}

/**
 * Collect the full connection listing (remote accounts merged with local
 * token status, plus resolved allowed domains). Used by both the
 * `connections` command and the `status` command's human output.
 */
export async function collectConnections(store: CredentialStore): Promise<ConnectionSummary> {
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
    const entries = await Promise.all(
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
          allowedDomains: await resolveAllowedDomains(store, acct.connection, services),
          remote: true,
        };
      })
    );
    return { entries, remote: true };
  }

  const connections = await store.listConnections();
  const entries = await Promise.all(
    connections.map(async (conn) => {
      const entry = await store.getConnectionEntry(conn);
      const services = getServicesForConnection(conn);
      return {
        connection: conn,
        services,
        service: services.join(', ') || conn,
        scopes: entry?.scopes ?? [],
        tokenStatus: localTokenStatus(entry),
        allowedDomains: await resolveAllowedDomains(store, conn, services),
        remote: false,
      };
    })
  );
  return { entries, remote: false };
}

/**
 * Render a connection summary as human-readable text. Returns lines to be
 * joined by the caller so they can control surrounding spacing.
 */
export function formatConnectionsHuman(summary: ConnectionSummary): string[] {
  if (summary.entries.length === 0) {
    return [chalk.dim('No services connected.')];
  }
  const heading = summary.remote ? 'Connected services:' : 'Connected services (local only):';
  return [heading, ...summary.entries.map(formatConnectionLine)];
}

function formatConnectionLine(e: {
  service: string;
  connection: string;
  tokenStatus: string;
  scopes: string[];
  allowedDomains: string[];
}): string {
  const scopes = e.scopes.length > 0 ? `\n    scopes: ${chalk.dim(e.scopes.join(', '))}` : '';
  const domains =
    e.allowedDomains.length > 0
      ? `\n    allowed domains: ${chalk.dim(e.allowedDomains.join(', '))}`
      : '';
  return `  ${chalk.cyan(e.service)} (${e.connection}) — local token: ${formatTokenStatus(e.tokenStatus)}${scopes}${domains}`;
}

export function registerConnectionsCommand(program: Command) {
  program
    .command('connections')
    .description('List connected services')
    .action(async (_opts, cmd: Command) => {
      const store = new CredentialStore();
      const summary = await collectConnections(store);

      if (summary.entries.length === 0) {
        output(
          { connections: [] },
          chalk.yellow('No services connected. Use `auth0-tv connect <service>` to connect one.'),
          cmd
        );
        return;
      }

      output({ connections: summary.entries }, formatConnectionsHuman(summary).join('\n'), cmd);
    });
}
