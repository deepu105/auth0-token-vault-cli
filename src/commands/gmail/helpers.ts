import type { Command } from 'commander';
import { GmailClient } from '../../services/gmail/client.js';
import { classifyGoogleError } from '../../utils/classify-google-error.js';
import { createServiceClient, handleServiceError } from '../service-helpers.js';

// Re-export shared helpers so existing gmail command imports remain unchanged
export { requireConfirmation, resolveBody } from '../service-helpers.js';

export async function createGmailClient(cmd: Command): Promise<GmailClient> {
  return createServiceClient(GmailClient, 'gmail', cmd);
}

export function handleGmailError(err: unknown, cmd: Command): never {
  return handleServiceError(err, cmd, 'gmail', classifyGoogleError);
}
