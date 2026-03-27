import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../utils/output.js';
import { EXIT_AUTH_REQUIRED, EXIT_INVALID_INPUT } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { listConnectedAccounts, deleteConnectedAccount } from '../auth/connected-accounts.js';
import { requireConfig } from '../utils/config.js';
import { logError } from '../utils/logger.js';

const SERVICE_TO_CONNECTION: Record<string, string> = {
  gmail: 'google-oauth2',
};

export function registerDisconnectCommand(program: Command) {
  program
    .command('disconnect <service>')
    .description('Disconnect a third-party service')
    .option('--remote', 'Also remove the server-side connection (Auth0 Token Vault)')
    .action(async (service: string, opts, cmd: Command) => {
      const serviceLower = service.toLowerCase();
      const connection = SERVICE_TO_CONNECTION[serviceLower];

      if (!connection) {
        outputError(
          {
            code: 'invalid_service',
            message: `Unknown service: ${service}. Available: ${Object.keys(SERVICE_TO_CONNECTION).join(', ')}`,
          },
          cmd
        );
        process.exit(EXIT_INVALID_INPUT);
      }

      const store = new CredentialStore();
      let remoteDeleted = false;

      if (opts.remote) {
        // Require login for remote deletion
        try {
          const config = await requireConfig(store);
          const auth0Tokens = await store.getAuth0Tokens();
          if (!auth0Tokens?.refreshToken) {
            outputError(
              { code: 'auth_required', message: 'Not logged in. Run `auth0-tv login` first.' },
              cmd
            );
            process.exit(EXIT_AUTH_REQUIRED);
          }

          // Find the account ID by listing remote accounts
          const accounts = await listConnectedAccounts(config, auth0Tokens.refreshToken);
          const account = accounts.find((a) => a.connection === connection);

          if (account) {
            await deleteConnectedAccount(config, auth0Tokens.refreshToken, account.id);
            remoteDeleted = true;
          } else {
            output(
              { status: 'warning', message: `No remote connection found for ${serviceLower}` },
              chalk.yellow(`Warning: No remote connection found for ${serviceLower}.`),
              cmd
            );
          }
        } catch (err) {
          logError('Remote disconnect failed', err);
          const errMsg = err instanceof Error ? err.message : String(err);
          output(
            { status: 'warning', message: `Remote disconnect failed: ${errMsg}` },
            chalk.yellow(`Warning: Remote disconnect failed — ${errMsg}`),
            cmd
          );
        }
      }

      // Always remove local token
      const removed = await store.removeConnection(connection);

      if (removed || remoteDeleted) {
        output(
          { status: 'disconnected', service: serviceLower, remote: remoteDeleted },
          remoteDeleted
            ? chalk.green(`Disconnected ${serviceLower} (local + remote).`)
            : chalk.green(`Disconnected ${serviceLower} (local).`),
          cmd
        );
      } else {
        output(
          { status: 'not_connected', service: serviceLower },
          chalk.yellow(`${serviceLower} was not connected.`),
          cmd
        );
      }
    });
}
