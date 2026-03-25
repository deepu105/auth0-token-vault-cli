import type { Command } from 'commander';
import chalk from 'chalk';
import { output, outputError } from '../utils/output.js';
import { EXIT_INVALID_INPUT } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';

const SERVICE_TO_CONNECTION: Record<string, string> = {
  gmail: 'google-oauth2',
};

export function registerDisconnectCommand(program: Command) {
  program
    .command('disconnect <service>')
    .description('Disconnect a third-party service')
    .action(async (service: string, _opts, cmd: Command) => {
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
      const removed = await store.removeConnection(connection);

      if (removed) {
        output(
          { status: 'disconnected', service: serviceLower },
          chalk.green(`Disconnected ${serviceLower}.`),
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
