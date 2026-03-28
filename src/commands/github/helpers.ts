import type { Command } from 'commander';
import { GitHubClient } from '../../services/github/client.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_SERVICE_ERROR,
} from '../../utils/exit-codes.js';
import { capitalize } from '../../utils/format-helpers.js';
import { createServiceClient, handleServiceError } from '../service-helpers.js';

export { requireConfirmation } from '../service-helpers.js';

export async function createGitHubClient(cmd: Command): Promise<GitHubClient> {
  return createServiceClient(GitHubClient, 'github', cmd);
}

export function handleGitHubError(err: unknown, cmd: Command): never {
  return handleServiceError(err, cmd, 'github', classifyGitHubError);
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

/** Classify GitHub API errors. */
export function classifyGitHubError(
  err: unknown,
  serviceName: string
): { code: string; message: string; exitCode: number } | undefined {
  const statusCode = (err as any)?.status;
  if (statusCode === 401) {
    return {
      code: 'auth_required',
      message: `${capitalize(serviceName)} token expired. Run \`auth0-tv connect ${serviceName}\`.`,
      exitCode: EXIT_AUTH_REQUIRED,
    };
  }
  if (statusCode === 403) {
    return {
      code: 'authorization_required',
      message: `Insufficient ${capitalize(serviceName)} scopes. Run \`auth0-tv connect ${serviceName}\` to grant additional permissions.`,
      exitCode: EXIT_AUTHZ_REQUIRED,
    };
  }
  if (statusCode === 404) {
    return {
      code: 'not_found',
      message: (err as Error)?.message || 'Resource not found.',
      exitCode: EXIT_SERVICE_ERROR,
    };
  }
  return undefined;
}
