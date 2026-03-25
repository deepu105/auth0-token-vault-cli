import { http, HttpResponse } from 'msw';

const AUTH0_DOMAIN = 'test.auth0.com';

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

export const handlers = [
  // Auth0 token endpoint — authorization code exchange
  http.post(`https://${AUTH0_DOMAIN}/oauth/token`, async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;

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
