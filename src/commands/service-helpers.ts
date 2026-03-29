import type { Command } from 'commander';
import { requireConfig } from '../utils/config.js';
import { outputError } from '../utils/output.js';
import { EXIT_SERVICE_ERROR, EXIT_NETWORK_ERROR, isNetworkError } from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { exchangeForConnectionToken, TokenExchangeError } from '../auth/token-exchange.js';
import { getConnectionForService } from '../utils/service-registry.js';

// Re-export shared helpers so per-service helpers can re-export from here
export { requireConfirmation, resolveBody } from './shared-helpers.js';

/* ------------------------------------------------------------------ */
/*  Generic client factory                                            */
/* ------------------------------------------------------------------ */

/**
 * Create a service client wired to the credential store + token exchange.
 *
 * @param ClientClass - Constructor that accepts a token-getter function
 * @param serviceName - Canonical service name (e.g. "gmail", "slack", "github")
 * @param _cmd - Commander command (reserved for future use)
 */
export async function createServiceClient<T>(
  ClientClass: new (tokenGetter: () => Promise<string>) => T,
  serviceName: string,
  _cmd: Command
): Promise<T> {
  const connection = getConnectionForService(serviceName);
  if (!connection) {
    throw new Error(`Unknown service: ${serviceName}`);
  }
  return new ClientClass(async () => {
    const store = new CredentialStore();
    const config = await requireConfig(store);
    return exchangeForConnectionToken(config, store, connection);
  });
}

/* ------------------------------------------------------------------ */
/*  Error classification                                              */
/* ------------------------------------------------------------------ */

/**
 * A classifier inspects a caught error and returns a structured result
 * if it recognises the error, or `undefined` to let the generic handler
 * deal with it.
 */
export type ErrorClassifier = (
  err: unknown,
  serviceName: string
) => { code: string; message: string; exitCode: number } | undefined;

/* ------------------------------------------------------------------ */
/*  Shared error handler                                              */
/* ------------------------------------------------------------------ */

/**
 * Handle errors from service commands, mapping to exit codes.
 *
 * Processing order:
 * 1. TokenExchangeError (Auth0 token exchange failures)
 * 2. Network errors (ECONNREFUSED, fetch failed)
 * 3. Service-specific classification (via optional classifier)
 * 4. Fallback to generic service_error
 */
export function handleServiceError(
  err: unknown,
  cmd: Command,
  serviceName: string,
  classifyError?: ErrorClassifier
): never {
  // 1. TokenExchangeError
  if (err instanceof TokenExchangeError) {
    outputError({ code: 'token_exchange_error', message: err.message }, cmd);
    process.exit(err.exitCode);
  }

  const message = err instanceof Error ? err.message : String(err);

  // 2. Network errors
  if (isNetworkError(message)) {
    outputError({ code: 'network_error', message }, cmd);
    process.exit(EXIT_NETWORK_ERROR);
  }

  // 3. Service-specific classification
  if (classifyError) {
    const classified = classifyError(err, serviceName);
    if (classified) {
      outputError({ code: classified.code, message: classified.message }, cmd);
      process.exit(classified.exitCode);
    }
  }

  // 4. Fallback
  outputError({ code: 'service_error', message }, cmd);
  process.exit(EXIT_SERVICE_ERROR);
}

/* ------------------------------------------------------------------ */
/*  Higher-order action wrapper                                       */
/* ------------------------------------------------------------------ */

/**
 * Higher-order wrapper that eliminates the repeated try/catch + createClient
 * + handleError boilerplate in command action functions.
 *
 * Usage:
 *   .action(withServiceAction('gmail', GmailClient, classifyGoogleError, async (client, opts, cmd) => {
 *     const result = await client.search(query);
 *     output({ data: result }, formatResult(result), cmd);
 *   }))
 */
export function withServiceAction<T>(
  serviceName: string,
  ClientClass: new (tokenGetter: () => Promise<string>) => T,
  classifyError: ErrorClassifier | undefined,
  action: (client: T, opts: Record<string, any>, cmd: Command) => Promise<void>
): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    // Commander passes (positionalArgs..., options, command)
    // The last arg is always the Command, second-to-last is options
    const cmd: Command = args[args.length - 1];
    const opts = args[args.length - 2] ?? {};
    try {
      const client = await createServiceClient(ClientClass, serviceName, cmd);
      await action(client, opts, cmd);
    } catch (err) {
      handleServiceError(err, cmd, serviceName, classifyError);
    }
  };
}
