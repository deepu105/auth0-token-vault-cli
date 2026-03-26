import * as client from 'openid-client';
import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';
import type { Auth0Tokens } from '../store/types.js';
import { getOidcConfig } from './oidc-config.js';

/**
 * Use a stored refresh token to obtain a new Auth0 access token
 * via the standard OAuth2 refresh_token grant.
 *
 * If the Auth0 tenant has refresh token rotation enabled, the response
 * will include a new refresh_token which is returned for the caller to persist.
 */
export async function refreshAuth0Token(
  config: Auth0Config,
  refreshToken: string
): Promise<Auth0Tokens> {
  log('refreshing auth0 access token');

  const oidcConfig = await getOidcConfig(config);
  const tokens = await client.refreshTokenGrant(oidcConfig, refreshToken);

  log('auth0 access token refreshed successfully');

  return {
    accessToken: tokens.access_token,
    // Keep the existing refresh token if Auth0 doesn't return a new one (rotation disabled)
    refreshToken: tokens.refresh_token ?? refreshToken,
    idToken: tokens.id_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 86400) * 1000,
  };
}
