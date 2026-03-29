import type { Command } from 'commander';
import { GitHubClient } from '../../services/github/client.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_INVALID_INPUT,
  EXIT_SERVICE_ERROR,
} from '../../utils/exit-codes.js';
import { capitalize } from '../../utils/format-helpers.js';
import { outputError } from '../../utils/output.js';
import { createServiceClient, handleServiceError, withServiceAction } from '../service-helpers.js';

export { requireConfirmation } from '../service-helpers.js';

export async function createGitHubClient(cmd: Command): Promise<GitHubClient> {
  return createServiceClient(GitHubClient, 'github', cmd);
}

export function handleGitHubError(err: unknown, cmd: Command): never {
  return handleServiceError(err, cmd, 'github', classifyGitHubError);
}

export function withGitHubAction(
  action: (client: GitHubClient, positionals: any[], opts: any, cmd: Command) => Promise<void>
) {
  return withServiceAction('github', GitHubClient, classifyGitHubError, action);
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
 * Parse and validate an "owner/repo" argument, exiting with an error if invalid.
 */
export function requireOwnerRepo(ownerRepo: string, cmd: Command): { owner: string; repo: string } {
  const parsed = parseOwnerRepo(ownerRepo);
  if (!parsed) {
    outputError({ code: 'invalid_input', message: 'Invalid format. Expected owner/repo.' }, cmd);
    process.exit(EXIT_INVALID_INPUT);
  }
  return parsed;
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
