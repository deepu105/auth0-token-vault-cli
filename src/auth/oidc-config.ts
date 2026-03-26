import * as client from 'openid-client';
import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';

const configCache = new Map<string, client.Configuration>();

/**
 * Get an openid-client Configuration for the given Auth0 config.
 * Uses OIDC discovery and caches per domain for the process lifetime.
 * Calls allowInsecureRequests() to permit http://127.0.0.1 callback URIs.
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

  configCache.set(config.domain, oidcConfig);
  return oidcConfig;
}

/** Clear the config cache (used in tests). */
export function clearOidcConfigCache(): void {
  configCache.clear();
}
