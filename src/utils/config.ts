import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { log } from './logger.js';

export type StorageBackend = 'keyring' | 'file';

export interface Auth0Config {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience?: string;
  storage?: StorageBackend;
}

const CONFIG_DIR = join(homedir(), '.auth0-tv');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Load Auth0 configuration. Precedence:
 *  1. Environment variables (AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_AUDIENCE)
 *  2. Config file at ~/.auth0-tv/config.json
 */
export async function loadConfig(): Promise<Auth0Config> {
  // Try env vars first
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;

  if (domain && clientId && clientSecret) {
    log('config loaded from environment variables');
    return { domain, clientId, clientSecret, audience: process.env.AUTH0_AUDIENCE };
  }

  // Fall back to config file
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Auth0Config>;

    if (!parsed.domain || !parsed.clientId || !parsed.clientSecret) {
      throw new Error('config.json must contain "domain", "clientId", and "clientSecret"');
    }

    log('config loaded from %s', CONFIG_FILE);
    return {
      domain: parsed.domain,
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      audience: parsed.audience,
      storage: parsed.storage as StorageBackend | undefined,
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'No Auth0 configuration found. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET environment variables, ' +
          `or create ${CONFIG_FILE} with { "domain": "...", "clientId": "...", "clientSecret": "..." }`
      );
    }
    throw err;
  }
}

/**
 * Resolve the credential storage backend. Precedence:
 *  1. AUTH0_TV_STORAGE env var
 *  2. `storage` field in config.json
 *  3. Default: 'keyring'
 */
export function resolveStorageBackend(configStorage?: StorageBackend): StorageBackend {
  const envVal = process.env.AUTH0_TV_STORAGE;
  if (envVal) {
    if (envVal !== 'keyring' && envVal !== 'file') {
      throw new Error(
        `Invalid AUTH0_TV_STORAGE value "${envVal}". Must be "keyring" or "file".`
      );
    }
    return envVal;
  }
  return configStorage ?? 'keyring';
}
