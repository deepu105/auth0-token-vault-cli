import type { Command } from 'commander';
import { SlackClient } from '../../services/slack/client.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_INVALID_INPUT,
} from '../../utils/exit-codes.js';
import { capitalize } from '../../utils/format-helpers.js';
import { createServiceClient, handleServiceError, withServiceAction } from '../service-helpers.js';

export { requireConfirmation } from '../service-helpers.js';

export async function createSlackClient(cmd: Command): Promise<SlackClient> {
  return createServiceClient(SlackClient, 'slack', cmd);
}

export function handleSlackError(err: unknown, cmd: Command): never {
  return handleServiceError(err, cmd, 'slack', classifySlackError);
}

export function withSlackAction(
  action: (client: SlackClient, positionals: any[], opts: any, cmd: Command) => Promise<void>
) {
  return withServiceAction('slack', SlackClient, classifySlackError, action);
}

/**
 * Try to extract a Slack error code from an error message string.
 * @slack/web-api formats errors as: "An API error occurred: <error_code>"
 */
function extractSlackErrorCode(message: string): string | undefined {
  const match = message.match(/An API error occurred: (\S+)/);
  return match?.[1];
}

/** Classify Slack API errors. */
export function classifySlackError(
  err: unknown,
  serviceName: string
): { code: string; message: string; exitCode: number } | undefined {
  const message = err instanceof Error ? err.message : String(err);
  const slackError = (err as any)?.data?.error ?? extractSlackErrorCode(message);
  if (!slackError) return undefined;

  switch (slackError) {
    case 'not_authed':
    case 'invalid_auth':
    case 'token_expired':
    case 'token_revoked':
      return {
        code: 'auth_required',
        message: `${capitalize(serviceName)} token expired or invalid. Run \`auth0-tv connect ${serviceName}\`.`,
        exitCode: EXIT_AUTH_REQUIRED,
      };

    case 'missing_scope':
      return {
        code: 'authorization_required',
        message: `Insufficient ${capitalize(serviceName)} scopes. Run \`auth0-tv connect ${serviceName}\` to grant additional permissions.`,
        exitCode: EXIT_AUTHZ_REQUIRED,
      };

    case 'channel_not_found':
    case 'not_in_channel':
    case 'is_archived':
      return {
        code: 'invalid_input',
        message: `Slack error: ${slackError}`,
        exitCode: EXIT_INVALID_INPUT,
      };

    default:
      return undefined;
  }
}
