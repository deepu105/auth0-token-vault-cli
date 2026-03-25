import type { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { readFile } from 'node:fs/promises';
import { requireConfig } from '../../utils/config.js';
import { outputError } from '../../utils/output.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_INVALID_INPUT,
  EXIT_SERVICE_ERROR,
  EXIT_NETWORK_ERROR,
} from '../../utils/exit-codes.js';
import { CredentialStore } from '../../store/credential-store.js';
import { exchangeForConnectionToken, TokenExchangeError } from '../../auth/token-exchange.js';
import { GmailClient } from '../../services/gmail/client.js';

const CONNECTION = 'google-oauth2';

/**
 * Create a GmailClient wired to the credential store + token exchange.
 * Exits with appropriate codes if auth/authz fails.
 */
export async function createGmailClient(cmd: Command): Promise<GmailClient> {
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
    outputError({ code: 'auth_required', message: 'Gmail token expired. Run `auth0-tv connect gmail`.' }, cmd);
    process.exit(EXIT_AUTH_REQUIRED);
  }

  outputError({ code: 'service_error', message }, cmd);
  process.exit(EXIT_SERVICE_ERROR);
}

/** Check --confirm/--yes flag. For destructive actions in non-TTY mode. */
function isConfirmed(cmd: Command): boolean {
  let root = cmd;
  while (root.parent) root = root.parent;
  const opts = root.opts();
  return opts.confirm === true || opts.yes === true;
}

/**
 * Require confirmation for destructive actions.
 * - If --confirm/--yes is set, proceed.
 * - If TTY, prompt interactively.
 * - If no TTY and no flag, exit with code 2.
 */
export async function requireConfirmation(action: string, cmd: Command): Promise<void> {
  if (isConfirmed(cmd)) return;

  if (!process.stdin.isTTY) {
    outputError(
      {
        code: 'confirmation_required',
        message: `Destructive action "${action}" requires --confirm or --yes flag in non-interactive mode.`,
      },
      cmd
    );
    process.exit(EXIT_INVALID_INPUT);
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(`${action} — are you sure? (y/N) `);
  rl.close();

  if (answer.toLowerCase() !== 'y') {
    process.stderr.write('Cancelled.\n');
    process.exit(0);
  }
}

/**
 * Resolve message body from --body, --body-file, or stdin.
 */
export async function resolveBody(opts: {
  body?: string;
  bodyFile?: string;
}): Promise<string | null> {
  if (opts.body) return opts.body;

  if (opts.bodyFile) {
    return readFile(opts.bodyFile, 'utf-8');
  }

  // Read from stdin if piped
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf-8').trim();
    if (text) return text;
  }

  return null;
}
