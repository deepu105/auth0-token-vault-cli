import * as client from 'openid-client';
import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';

/** Timeout for all HTTP requests made via openid-client or direct fetch. */
export const HTTP_TIMEOUT_MS = 30_000;

const configCache = new Map<string, client.Configuration>();

/**
 * Get an openid-client Configuration for the given Auth0 config.
 * Uses OIDC discovery and caches per domain for the process lifetime.
 * Calls allowInsecureRequests() to permit http://127.0.0.1 callback URIs.
 * Sets a custom fetch wrapper with a 30-second timeout.
 */
export async function getOidcConfig(config: Auth0Config): Promise<client.Configuration> {
  const cached = configCache.get(config.domain);
  if (cached) {
    log('using cached oidc config for %s', config.domain);
    return cached;
  }

  log('discovering oidc config for %s', config.domain);
  const issuer = new URL(`https://${config.domain}`);
  const oidcConfig = await client.discovery(issuer, config.clientId, config.clientSecret);

  // Allow http://127.0.0.1 callback URIs (standard for native CLI apps)
  client.allowInsecureRequests(oidcConfig);

  // Add a timeout to all HTTP requests made by openid-client.
  // openid-client's CustomFetch type differs from standard fetch,
  // but the runtime signature is compatible.
  oidcConfig[client.customFetch] = ((...args: any[]) => {
    const [input, init] = args;
    return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  }) as any;

  configCache.set(config.domain, oidcConfig);
  return oidcConfig;
}

/** Clear the config cache (used in tests). */
export function clearOidcConfigCache(): void {
  configCache.clear();
}
