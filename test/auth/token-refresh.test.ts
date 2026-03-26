import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from '../mocks/handlers.js';
import { refreshAuth0Token } from '../../src/auth/token-refresh.js';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import type { Auth0Config } from '../../src/utils/config.js';

const config: Auth0Config = {
  domain: 'test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('refreshAuth0Token', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('returns new access token on successful refresh', async () => {
    const result = await refreshAuth0Token(config, 'my-refresh-token');
    expect(result.accessToken).toBe('refreshed-access-token');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('preserves original refresh token when server does not return a new one', async () => {
    const result = await refreshAuth0Token(config, 'my-refresh-token');
    // Default mock does not return refresh_token
    expect(result.refreshToken).toBe('my-refresh-token');
  });

  it('returns new refresh token when server provides one (rotation)', async () => {
    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json({
          access_token: 'rotated-access-token',
          refresh_token: 'rotated-refresh-token',
          expires_in: 86400,
          token_type: 'Bearer',
        })
      )
    );

    const result = await refreshAuth0Token(config, 'old-refresh-token');
    expect(result.accessToken).toBe('rotated-access-token');
    expect(result.refreshToken).toBe('rotated-refresh-token');
  });

  it('throws on server error', async () => {
    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json(
          { error: 'invalid_grant', error_description: 'The refresh token is expired' },
          { status: 400 }
        )
      )
    );

    await expect(refreshAuth0Token(config, 'expired-refresh-token')).rejects.toThrow();
  });
});
