import { http, HttpResponse } from 'msw';

const AUTH0_DOMAIN = 'test.auth0.com';

/** Mock OIDC discovery response for openid-client */
export const mockDiscoveryResponse = {
  issuer: `https://${AUTH0_DOMAIN}/`,
  authorization_endpoint: `https://${AUTH0_DOMAIN}/authorize`,
  token_endpoint: `https://${AUTH0_DOMAIN}/oauth/token`,
  userinfo_endpoint: `https://${AUTH0_DOMAIN}/userinfo`,
  jwks_uri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  code_challenge_methods_supported: ['S256'],
};

/** Default token response from Auth0 /oauth/token */
export const mockTokenResponse = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  id_token:
    // Minimal JWT with email/name claims (header.payload.signature)
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
    Buffer.from(
      JSON.stringify({
        sub: 'auth0|123',
        email: 'test@example.com',
        name: 'Test User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url') +
    '.mock-signature',
  expires_in: 86400,
  token_type: 'Bearer',
  scope: 'openid profile email offline_access',
};

/** Mock token exchange response (federated connection) */
export const mockExchangeResponse = {
  access_token: 'mock-gmail-access-token',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/gmail.modify',
};

/** Parse request body as either JSON or form-encoded (openid-client uses form-encoded) */
export async function parseBody(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return (await request.json()) as Record<string, string>;
  }
  // application/x-www-form-urlencoded
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text));
}

export const handlers = [
  // OIDC discovery endpoint
  http.get(`https://${AUTH0_DOMAIN}/.well-known/openid-configuration`, () =>
    HttpResponse.json(mockDiscoveryResponse)
  ),

  // Auth0 token endpoint
  http.post(`https://${AUTH0_DOMAIN}/oauth/token`, async ({ request }) => {
    const body = await parseBody(request);

    // Federated connection token exchange
    if (
      body.grant_type ===
      'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token'
    ) {
      if (!body.subject_token) {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Missing subject_token' },
          { status: 400 }
        );
      }
      return HttpResponse.json(mockExchangeResponse);
    }

    // Refresh token grant
    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Missing refresh_token' },
          { status: 400 }
        );
      }
      return HttpResponse.json({
        access_token: 'refreshed-access-token',
        expires_in: 86400,
        token_type: 'Bearer',
      });
    }

    // Authorization code exchange
    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.code_verifier) {
        return HttpResponse.json(
          { error: 'invalid_request', error_description: 'Missing code or code_verifier' },
          { status: 400 }
        );
      }
      return HttpResponse.json(mockTokenResponse);
    }

    return HttpResponse.json(
      { error: 'unsupported_grant_type', error_description: 'Unsupported grant type' },
      { status: 400 }
    );
  }),
];
