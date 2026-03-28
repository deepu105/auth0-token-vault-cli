import type { Command } from 'commander';
import { requireConfig } from '../../utils/config.js';
import { outputError } from '../../utils/output.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_INVALID_INPUT,
  EXIT_SERVICE_ERROR,
  EXIT_NETWORK_ERROR,
} from '../../utils/exit-codes.js';
import { CredentialStore } from '../../store/credential-store.js';
import { exchangeForConnectionToken, TokenExchangeError } from '../../auth/token-exchange.js';
import { SlackClient } from '../../services/slack/client.js';

// Re-export shared helpers so slack command imports can use them directly
export { requireConfirmation } from '../shared-helpers.js';

const CONNECTION = 'sign-in-with-slack';

/**
 * Create a SlackClient wired to the credential store + token exchange.
 * Exits with appropriate codes if auth/authz fails.
 */
export async function createSlackClient(_cmd: Command): Promise<SlackClient> {
  const store = new CredentialStore();
  const config = await requireConfig(store);

  return new SlackClient(async () => {
    return exchangeForConnectionToken(config, store, CONNECTION);
  });
}

/**
 * Handle errors from Slack commands, mapping to exit codes.
 */
export function handleSlackError(err: unknown, cmd: Command): never {
  if (err instanceof TokenExchangeError) {
    outputError({ code: 'token_exchange_error', message: err.message }, cmd);
    process.exit(err.exitCode);
  }

  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    outputError({ code: 'network_error', message }, cmd);
    process.exit(EXIT_NETWORK_ERROR);
  }

  // Slack API errors: check err.data?.error (from @slack/web-api) or fall back to message
  const slackError =
    (err as any)?.data?.error ?? extractSlackErrorCode(message);

  if (slackError) {
    switch (slackError) {
      case 'not_authed':
      case 'invalid_auth':
      case 'token_expired':
      case 'token_revoked':
        outputError(
          {
            code: 'auth_required',
            message: 'Slack token expired or invalid. Run `auth0-tv connect slack`.',
          },
          cmd
        );
        process.exit(EXIT_AUTH_REQUIRED);
        break; // unreachable but keeps TS happy

      case 'missing_scope':
        outputError(
          {
            code: 'authorization_required',
            message:
              'Insufficient Slack scopes. Run `auth0-tv connect slack` to grant additional permissions.',
          },
          cmd
        );
        process.exit(EXIT_AUTHZ_REQUIRED);
        break;

      case 'channel_not_found':
      case 'not_in_channel':
      case 'is_archived':
        outputError(
          { code: 'invalid_input', message: `Slack error: ${slackError}` },
          cmd
        );
        process.exit(EXIT_INVALID_INPUT);
        break;
    }
  }

  outputError({ code: 'service_error', message }, cmd);
  process.exit(EXIT_SERVICE_ERROR);
}

/**
 * Try to extract a Slack error code from an error message string.
 * @slack/web-api errors often include the error code in the message.
 */
function extractSlackErrorCode(message: string): string | undefined {
  // @slack/web-api formats errors as: "An API error occurred: <error_code>"
  const match = message.match(/An API error occurred: (\S+)/);
  return match?.[1];
}
