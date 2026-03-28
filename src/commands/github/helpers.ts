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
import { GitHubClient } from '../../services/github/client.js';

export { requireConfirmation } from '../shared-helpers.js';

const CONNECTION = 'github';

/**
 * Create a GitHubClient wired to the credential store + token exchange.
 * Exits with appropriate codes if auth/authz fails.
 */
export async function createGitHubClient(_cmd: Command): Promise<GitHubClient> {
  const store = new CredentialStore();
  const config = await requireConfig(store);

  return new GitHubClient(async () => {
    return exchangeForConnectionToken(config, store, CONNECTION);
  });
}

/**
 * Parse an "owner/repo" string into its parts.
 * Returns undefined if the format is invalid.
 */
export function parseOwnerRepo(ownerRepo: string): { owner: string; repo: string } | undefined {
  const parts = ownerRepo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Handle errors from GitHub commands, mapping to exit codes.
 */
export function handleGitHubError(err: unknown, cmd: Command): never {
  if (err instanceof TokenExchangeError) {
    outputError({ code: 'token_exchange_error', message: err.message }, cmd);
    process.exit(err.exitCode);
  }

  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    outputError({ code: 'network_error', message }, cmd);
    process.exit(EXIT_NETWORK_ERROR);
  }

  const statusCode = (err as any)?.status;
  if (statusCode === 401) {
    outputError(
      {
        code: 'auth_required',
        message: 'GitHub token expired. Run `auth0-tv connect github`.',
      },
      cmd
    );
    process.exit(EXIT_AUTH_REQUIRED);
  }

  if (statusCode === 403) {
    outputError(
      {
        code: 'authorization_required',
        message:
          'Insufficient GitHub scopes. Run `auth0-tv connect github` to grant additional permissions.',
      },
      cmd
    );
    process.exit(EXIT_AUTHZ_REQUIRED);
  }

  if (statusCode === 404) {
    outputError({ code: 'not_found', message: message || 'Resource not found.' }, cmd);
    process.exit(EXIT_SERVICE_ERROR);
  }

  outputError({ code: 'service_error', message }, cmd);
  process.exit(EXIT_SERVICE_ERROR);
}
