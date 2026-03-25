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
 * Try to load Auth0 config from environment variables only.
 * Returns null if any required variable is missing.
 */
export function loadConfigFromEnv(): Auth0Config | null {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;

  if (domain && clientId && clientSecret) {
    log('config loaded from environment variables');
    return { domain, clientId, clientSecret, audience: process.env.AUTH0_AUDIENCE };
  }
  return null;
}

/**
 * Try to load Auth0 config from the credential store.
 * Returns null if no config is stored.
 */
export async function loadConfigFromStore(store: CredentialStore): Promise<Auth0Config | null> {
  const stored = await store.getConfig();
  if (!stored) return null;
  log('config loaded from credential store');
  return {
    domain: stored.domain,
    clientId: stored.clientId,
    clientSecret: stored.clientSecret,
    audience: stored.audience,
  };
}

/**
 * Load Auth0 config for non-login commands. Precedence:
 *  1. Environment variables
 *  2. Credential store
 *  3. Error with instructions to run login
 */
export async function requireConfig(store: CredentialStore): Promise<Auth0Config> {
  const fromEnv = loadConfigFromEnv();
  if (fromEnv) return fromEnv;

  const fromStore = await loadConfigFromStore(store);
  if (fromStore) return fromStore;

  throw new Error(
    'Not configured. Run `auth0-tv login` first, or set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET environment variables.'
  );
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
      throw new Error(
        `Invalid AUTH0_TV_STORAGE value "${envVal}". Must be "keyring" or "file".`
      );
    }
    return envVal;
  }
  return 'keyring';
}
