import type { Command } from 'commander';
import { requireConfig } from '../../utils/config.js';
import { outputError } from '../../utils/output.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_SERVICE_ERROR,
  EXIT_NETWORK_ERROR,
} from '../../utils/exit-codes.js';
import { CredentialStore } from '../../store/credential-store.js';
import { exchangeForConnectionToken, TokenExchangeError } from '../../auth/token-exchange.js';
import { CalendarClient } from '../../services/calendar/client.js';

export { requireConfirmation } from '../shared-helpers.js';

const CONNECTION = 'google-oauth2';

/**
 * Create a CalendarClient wired to the credential store + token exchange.
 * Exits with appropriate codes if auth/authz fails.
 */
export async function createCalendarClient(_cmd: Command): Promise<CalendarClient> {
  const store = new CredentialStore();
  const config = await requireConfig(store);

  return new CalendarClient(async () => {
    return exchangeForConnectionToken(config, store, CONNECTION);
  });
}

/**
 * Handle errors from Calendar commands, mapping to exit codes.
 */
export function handleCalendarError(err: unknown, cmd: Command): never {
  if (err instanceof TokenExchangeError) {
    outputError({ code: 'token_exchange_error', message: err.message }, cmd);
    process.exit(err.exitCode);
  }

  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    outputError({ code: 'network_error', message }, cmd);
    process.exit(EXIT_NETWORK_ERROR);
  }

  // googleapis errors often have a code property
  const statusCode = (err as any)?.code ?? (err as any)?.status;
  if (statusCode === 401) {
    outputError(
      { code: 'auth_required', message: 'Calendar token expired. Run `auth0-tv connect calendar`.' },
      cmd
    );
    process.exit(EXIT_AUTH_REQUIRED);
  }

  if (statusCode === 403) {
    outputError(
      {
        code: 'authorization_required',
        message:
          'Insufficient Calendar scopes. Run `auth0-tv connect calendar` to grant additional permissions.',
      },
      cmd
    );
    process.exit(EXIT_AUTHZ_REQUIRED);
  }

  outputError({ code: 'service_error', message }, cmd);
  process.exit(EXIT_SERVICE_ERROR);
}
