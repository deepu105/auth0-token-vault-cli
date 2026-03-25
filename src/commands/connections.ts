import type { Command } from 'commander';
import chalk from 'chalk';
import { output } from '../utils/output.js';
import { CredentialStore } from '../store/credential-store.js';

const CONNECTION_TO_SERVICE: Record<string, string> = {
  'google-oauth2': 'gmail',
};

export function registerConnectionsCommand(program: Command) {
  program
    .command('connections')
    .description('List connected services')
    .action(async (_opts, cmd: Command) => {
      const store = new CredentialStore();
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
          const expired = entry ? Date.now() >= entry.expiresAt : true;
          return {
            connection: conn,
            service: CONNECTION_TO_SERVICE[conn] ?? conn,
            scopes: entry?.scopes ?? [],
            tokenStatus: expired ? 'expired' : 'valid',
          };
        })
      );

      const humanLines = entries.map((e) => {
        const status =
          e.tokenStatus === 'valid' ? chalk.green('valid') : chalk.yellow('expired (will refresh)');
        return `  ${chalk.cyan(e.service)} (${e.connection}) — token: ${status}`;
      });

      output(
        { connections: entries },
        `Connected services:\n${humanLines.join('\n')}`,
        cmd
      );
    });
}
