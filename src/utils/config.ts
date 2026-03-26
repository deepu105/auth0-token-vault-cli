import { log } from './logger.js';
import type { CredentialStore } from '../store/credential-store.js';
import type { StoredConfig } from '../store/types.js';

export type StorageBackend = 'keyring' | 'file';

export interface Auth0Config {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience?: string;
}

/**
 * Resolve each config field individually: env var → stored value.
 * Returns the merged result and a list of missing required fields.
 */
export function mergeConfigFromEnvAndStore(stored?: StoredConfig | null): {
  domain?: string;
  clientId?: string;
  clientSecret?: string;
  audience?: string;
  missing: string[];
} {
  const domain = process.env.AUTH0_DOMAIN || stored?.domain;
  const clientId = process.env.AUTH0_CLIENT_ID || stored?.clientId;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET || stored?.clientSecret;
  const audience = process.env.AUTH0_AUDIENCE || stored?.audience;

  const missing = [
    !domain && 'AUTH0_DOMAIN',
    !clientId && 'AUTH0_CLIENT_ID',
    !clientSecret && 'AUTH0_CLIENT_SECRET',
  ].filter(Boolean) as string[];

  return { domain, clientId, clientSecret, audience, missing };
}

/**
 * Load Auth0 config for non-login commands. Each field is resolved
 * individually: env var first, then credential store. Errors if any
 * required field is still missing.
 */
export async function requireConfig(store: CredentialStore): Promise<Auth0Config> {
  const stored = await store.getConfig();
  const { domain, clientId, clientSecret, audience, missing } = mergeConfigFromEnvAndStore(stored);

  if (missing.length === 0) {
    log('config resolved from env/store');
    return {
      domain: domain!,
      clientId: clientId!,
      clientSecret: clientSecret!,
      audience: audience || undefined,
    };
  }

  throw new Error(
    `Not configured. Run \`auth0-tv login\` first, or set ${missing.join(', ')} environment variable${missing.length > 1 ? 's' : ''}.`
  );
}

/**
 * Resolve the browser to use for auth flows. Precedence:
 *  1. --browser CLI flag (passed via Commander)
 *  2. AUTH0_TV_BROWSER env var
 *  3. undefined (system default)
 */
export function resolveBrowser(flagValue?: string): string | undefined {
  return flagValue || process.env.AUTH0_TV_BROWSER || undefined;
}

/**
 * Resolve the credential storage backend. Precedence:
 *  1. AUTH0_TV_STORAGE env var
 *  2. Default: 'keyring'
 */
export function resolveStorageBackend(): StorageBackend {
  const envVal = process.env.AUTH0_TV_STORAGE;
  if (envVal) {
    if (envVal !== 'keyring' && envVal !== 'file') {
      throw new Error(`Invalid AUTH0_TV_STORAGE value "${envVal}". Must be "keyring" or "file".`);
    }
    return envVal;
  }
  return 'keyring';
}
