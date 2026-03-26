import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';
import type { Auth0Tokens } from '../store/types.js';

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

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

  const res = await fetch(`https://${config.domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errDesc = (errBody as Record<string, string>).error_description ?? `HTTP ${res.status}`;
    log('token refresh failed: %s', errDesc);
    throw new Error(`Token refresh failed: ${errDesc}`);
  }

  const data = (await res.json()) as RefreshResponse;

  log('auth0 access token refreshed successfully');

  return {
    accessToken: data.access_token,
    // Keep the existing refresh token if Auth0 doesn't return a new one (rotation disabled)
    refreshToken: data.refresh_token ?? refreshToken,
    idToken: data.id_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
