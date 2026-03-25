import type { Command } from 'commander';
import chalk from 'chalk';
import { jwtDecode } from 'jwt-decode';
import { output } from '../utils/output.js';
import { CredentialStore } from '../store/credential-store.js';

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
      const auth0Tokens = await store.getAuth0Tokens();

      if (!auth0Tokens) {
        output(
          { loggedIn: false },
          chalk.yellow('Not logged in. Run `auth0-tv login` to authenticate.'),
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

      const expired = Date.now() >= auth0Tokens.expiresAt;
      const connections = await store.listConnections();

      const data = {
        loggedIn: !expired,
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
        `  User:    ${user.name ?? user.email ?? user.sub ?? 'unknown'}`,
        `  Email:   ${user.email ?? 'n/a'}`,
        `  Session: ${expired ? chalk.yellow('expired') : chalk.green('active')}`,
        '',
        connections.length > 0
          ? `  Connected: ${connections.map((c) => chalk.cyan(c)).join(', ')}`
          : chalk.dim('  No services connected'),
      ];

      output(data, lines.join('\n'), cmd);
    });
}
