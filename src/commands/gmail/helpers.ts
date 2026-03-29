import type { Command } from 'commander';
import { GmailClient } from '../../services/gmail/client.js';
import { EXIT_INVALID_INPUT } from '../../utils/exit-codes.js';
import { outputError } from '../../utils/output.js';
import { classifyGoogleError } from '../../utils/classify-google-error.js';
import { createServiceClient, handleServiceError, resolveBody } from '../service-helpers.js';

// Re-export shared helpers so existing gmail command imports remain unchanged
export { requireConfirmation, resolveBody } from '../service-helpers.js';

export async function createGmailClient(cmd: Command): Promise<GmailClient> {
  return createServiceClient(GmailClient, 'gmail', cmd);
}

export function handleGmailError(err: unknown, cmd: Command): never {
  return handleServiceError(err, cmd, 'gmail', classifyGoogleError);
}

/**
 * Resolve message body from opts, exiting with an error if none provided.
 */
export async function requireBody(
  opts: { body?: string; bodyFile?: string },
  label: string,
  cmd: Command
): Promise<string> {
  const body = await resolveBody(opts);
  if (!body) {
    outputError(
      {
        code: 'missing_body',
        message: `${label} required. Use --body, --body-file, or pipe via stdin.`,
      },
      cmd
    );
    process.exit(EXIT_INVALID_INPUT);
  }
  return body;
}
