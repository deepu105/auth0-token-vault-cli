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
import { GmailClient } from '../../services/gmail/client.js';

// Re-export shared helpers so existing gmail command imports remain unchanged
export { requireConfirmation, resolveBody } from '../shared-helpers.js';

const CONNECTION = 'google-oauth2';

/**
 * Create a GmailClient wired to the credential store + token exchange.
 * Exits with appropriate codes if auth/authz fails.
 */
export async function createGmailClient(_cmd: Command): Promise<GmailClient> {
  const store = new CredentialStore();
  const config = await requireConfig(store);

  return new GmailClient(async () => {
    return exchangeForConnectionToken(config, store, CONNECTION);
  });
}

/**
 * Handle errors from Gmail commands, mapping to exit codes.
 */
export function handleGmailError(err: unknown, cmd: Command): never {
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
      { code: 'auth_required', message: 'Gmail token expired. Run `auth0-tv connect gmail`.' },
      cmd
    );
    process.exit(EXIT_AUTH_REQUIRED);
  }

  if (statusCode === 403) {
    outputError(
      {
        code: 'authorization_required',
        message:
          'Insufficient Gmail scopes. Run `auth0-tv connect gmail` to grant additional permissions.',
      },
      cmd
    );
    process.exit(EXIT_AUTHZ_REQUIRED);
  }

  outputError({ code: 'service_error', message }, cmd);
  process.exit(EXIT_SERVICE_ERROR);
}
