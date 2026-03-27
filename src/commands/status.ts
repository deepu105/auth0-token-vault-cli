import type { Command } from 'commander';
import chalk from 'chalk';
import { jwtDecode } from 'jwt-decode';
import { output } from '../utils/output.js';
import { CredentialStore, EXPIRY_BUFFER_MS } from '../store/credential-store.js';
import { mergeConfigFromEnvAndStore, resolveStorageBackend } from '../utils/config.js';

interface IdTokenClaims {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

export function registerStatusCommand(program: Command) {
  program
    .command('status')
    .description('Show current user and connected services')
    .action(async (_opts, cmd: Command) => {
      const store = new CredentialStore();
      const storedConfig = await store.getConfig();
      const config = mergeConfigFromEnvAndStore(storedConfig);
      const auth0Tokens = await store.getAuth0Tokens();

      if (!auth0Tokens) {
        output(
          { loggedIn: false, domain: config.domain ?? null, clientId: config.clientId ?? null },
          [
            chalk.yellow('Not logged in. Run `auth0-tv login` to authenticate.'),
            ...(config.domain ? [`  Domain:   ${config.domain}`] : []),
            ...(config.clientId ? [`  Client ID: ${config.clientId}`] : []),
          ].join('\n'),
          cmd
        );
        return;
      }

      // Decode ID token for user info (never show raw tokens)
      let user: IdTokenClaims = {};
      if (auth0Tokens.idToken) {
        try {
          user = jwtDecode<IdTokenClaims>(auth0Tokens.idToken);
        } catch {
          // If token is malformed, just skip user info
        }
      }

      const expired = Date.now() >= auth0Tokens.expiresAt - EXPIRY_BUFFER_MS;
      const connections = await store.listConnections();
      const storage = resolveStorageBackend();

      const data = {
        loggedIn: !expired,
        domain: config.domain ?? null,
        clientId: config.clientId ?? null,
        storage,
        user: {
          email: user.email ?? null,
          name: user.name ?? null,
          sub: user.sub ?? null,
        },
        tokenStatus: expired ? 'expired' : 'valid',
        connections,
      };

      const lines = [
        chalk.bold('Auth0 Token Vault Status'),
        '',
        `  Domain:   ${config.domain ?? 'n/a'}`,
        `  Client ID: ${config.clientId ?? 'n/a'}`,
        `  User:    ${user.name ?? user.email ?? user.sub ?? 'unknown'}`,
        `  Email:   ${user.email ?? 'n/a'}`,
        `  Storage: ${storage}`,
        `  Session: ${expired ? chalk.yellow('expired') : chalk.green('active')}`,
        '',
        connections.length > 0
          ? `  Connected: ${connections.map((c) => chalk.cyan(c)).join(', ')}`
          : chalk.dim('  No services connected'),
      ];

      output(data, lines.join('\n'), cmd);
    });
}
