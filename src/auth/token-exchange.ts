import * as client from 'openid-client';
import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';
import type { CredentialStore } from '../store/credential-store.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_SERVICE_ERROR,
} from '../utils/exit-codes.js';
import { getOidcConfig } from './oidc-config.js';

const GRANT_TYPE =
  'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token';
const SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:refresh_token';
const REQUESTED_TOKEN_TYPE = 'http://auth0.com/oauth/token-type/federated-connection-access-token';

export class TokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number
  ) {
    super(message);
    this.name = 'TokenExchangeError';
  }
}

export interface ExchangeOptions {
  /** Optional login hint for matching user across systems. */
  loginHint?: string;
  /** Scopes to validate on the returned token. If any are missing, throws EXIT_AUTHZ_REQUIRED. */
  requiredScopes?: string[];
}

/**
 * Exchange an Auth0 access token for a federated connection access token
 * (e.g. Gmail). Caches the result in the credential store.
 */
export async function exchangeForConnectionToken(
  config: Auth0Config,
  store: CredentialStore,
  connection: string,
  options?: ExchangeOptions
): Promise<string> {
  // Check cache first
  const cached = await store.getConnectionToken(connection);
  if (cached) {
    // If requiredScopes were specified, verify the cached token covers them
    if (options?.requiredScopes?.length) {
      const entry = await store.getConnectionEntry(connection);
      const cachedScopes = entry?.scopes ?? [];
      const missing = options.requiredScopes.filter((s) => !cachedScopes.includes(s));
      if (missing.length > 0) {
        log('cached token for %s missing scopes: %s — re-exchanging', connection, missing.join(', '));
      } else {
        log('using cached connection token for %s (scopes validated)', connection);
        return cached;
      }
    } else {
      log('using cached connection token for %s', connection);
      return cached;
    }
  }

  // Need Auth0 refresh token for token exchange
  const auth0Tokens = await store.getAuth0Tokens();
  if (!auth0Tokens?.refreshToken) {
    throw new TokenExchangeError(
      'Not logged in or session expired (no refresh token). Run `auth0-tv login` first.',
      EXIT_AUTH_REQUIRED
    );
  }

  const params: Record<string, string> = {
    subject_token_type: SUBJECT_TOKEN_TYPE,
    subject_token: auth0Tokens.refreshToken,
    connection,
    requested_token_type: REQUESTED_TOKEN_TYPE,
  };

  if (options?.loginHint) {
    params.login_hint = options.loginHint;
  }

  log('exchanging token for connection %s', connection);

  let data: client.TokenEndpointResponse;
  try {
    const oidcConfig = await getOidcConfig(config);
    data = await client.genericGrantRequest(oidcConfig, GRANT_TYPE, params);
  } catch (err) {
    // Map openid-client errors to TokenExchangeError with appropriate exit codes
    const errCode = err instanceof client.ResponseBodyError ? err.error : undefined;
    const errDesc =
      err instanceof client.ResponseBodyError
        ? (err.error_description ?? err.message)
        : err instanceof Error
          ? err.message
          : String(err);

    log('token exchange failed: %s — %s', errCode ?? 'unknown', errDesc);

    if (errCode === 'unauthorized_client' || errCode === 'access_denied') {
      throw new TokenExchangeError(
        `Connection ${connection} not authorized. Run \`auth0-tv connect <service>\` first.`,
        EXIT_AUTHZ_REQUIRED
      );
    }
    if (errCode === 'invalid_grant' || errCode === 'expired_token') {
      throw new TokenExchangeError(
        'Session expired. Run `auth0-tv login` to re-authenticate.',
        EXIT_AUTH_REQUIRED
      );
    }
    if (errCode === 'federated_connection_refresh_token_flow_failed') {
      throw new TokenExchangeError(
        `Connection ${connection} token refresh failed. Run \`auth0-tv connect <service>\` to re-authorize.`,
        EXIT_AUTHZ_REQUIRED
      );
    }

    throw new TokenExchangeError(`Token exchange failed: ${errDesc}`, EXIT_SERVICE_ERROR);
  }

  // Validate required scopes if specified
  const scopeStr = data.scope as string | undefined;
  if (options?.requiredScopes?.length) {
    const grantedScopes = scopeStr ? scopeStr.split(' ') : [];
    const missing = options.requiredScopes.filter((s) => !grantedScopes.includes(s));
    if (missing.length > 0) {
      throw new TokenExchangeError(
        `Insufficient scopes for ${connection}. Missing: ${missing.join(', ')}. Run \`auth0-tv connect <service>\` to grant additional permissions.`,
        EXIT_AUTHZ_REQUIRED
      );
    }
  }

  // Cache with TTL
  const expiresIn = (data.expires_in ?? 3600) as number;
  await store.saveConnectionToken(connection, {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes: scopeStr ? scopeStr.split(' ') : [],
  });

  return data.access_token;
}
