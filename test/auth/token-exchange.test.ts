import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { CredentialStore } from '../../src/store/credential-store.js';
import { exchangeForConnectionToken, TokenExchangeError } from '../../src/auth/token-exchange.js';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import type { Auth0Config } from '../../src/utils/config.js';
import { handlers, mockExchangeResponse, parseBody } from '../mocks/handlers.js';

const config: Auth0Config = {
  domain: 'test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('exchangeForConnectionToken', () => {
  const msw = setupServer(...handlers);
  let tempDir: string;
  let store: CredentialStore;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-exchange-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('throws EXIT_AUTH_REQUIRED when not logged in', async () => {
    await expect(exchangeForConnectionToken(config, store, 'google-oauth2')).rejects.toThrow(
      TokenExchangeError
    );

    try {
      await exchangeForConnectionToken(config, store, 'google-oauth2');
    } catch (err) {
      expect((err as TokenExchangeError).exitCode).toBe(3);
    }
  });

  it('throws EXIT_AUTH_REQUIRED when logged in but no refresh token', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      expiresAt: Date.now() + 3600_000,
    });

    try {
      await exchangeForConnectionToken(config, store, 'google-oauth2');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenExchangeError);
      expect((err as TokenExchangeError).exitCode).toBe(3);
      expect((err as TokenExchangeError).message).toContain('refresh token');
    }
  });

  it('exchanges Auth0 token for Gmail token and caches it', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    const token = await exchangeForConnectionToken(config, store, 'google-oauth2');
    expect(token).toBe(mockExchangeResponse.access_token);

    // Should be cached now
    const cached = await store.getConnectionToken('google-oauth2');
    expect(cached).toBe(mockExchangeResponse.access_token);
  });

  it('returns cached token without making a request', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'cached-gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    const token = await exchangeForConnectionToken(config, store, 'google-oauth2');
    expect(token).toBe('cached-gmail-token');
  });

  it('returns cached token when no requiredScopes are specified', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'cached-gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });

    // No requiredScopes — should return cached token regardless of what scopes it has
    const token = await exchangeForConnectionToken(config, store, 'google-oauth2');
    expect(token).toBe('cached-gmail-token');
  });

  it('returns cached token when requiredScopes are all present', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'cached-gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
    });

    const token = await exchangeForConnectionToken(config, store, 'google-oauth2', {
      requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
    expect(token).toBe('cached-gmail-token');
  });

  it('skips cache and re-exchanges when cached token is missing requiredScopes', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'cached-gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });

    // Mock returns a token with the broader scopes after re-exchange
    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json({
          ...mockExchangeResponse,
          access_token: 'fresh-gmail-token',
          scope:
            'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
        })
      )
    );

    const token = await exchangeForConnectionToken(config, store, 'google-oauth2', {
      requiredScopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
    });
    // Should get the freshly exchanged token, not the cached one
    expect(token).toBe('fresh-gmail-token');
    expect(token).not.toBe('cached-gmail-token');
  });

  it('skips cache when cached token has empty scopes and requiredScopes are set', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'cached-gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: [],
    });

    // Mock returns a token with the required scope after re-exchange
    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json({
          ...mockExchangeResponse,
          access_token: 'fresh-gmail-token',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        })
      )
    );

    const token = await exchangeForConnectionToken(config, store, 'google-oauth2', {
      requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
    expect(token).toBe('fresh-gmail-token');
  });

  it('throws EXIT_AUTHZ_REQUIRED on access_denied', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json(
          { error: 'access_denied', error_description: 'Not authorized' },
          { status: 403 }
        )
      )
    );

    try {
      await exchangeForConnectionToken(config, store, 'google-oauth2');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenExchangeError);
      expect((err as TokenExchangeError).exitCode).toBe(4);
    }
  });

  it('throws EXIT_AUTHZ_REQUIRED on federated_connection_refresh_token_flow_failed', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json(
          {
            error: 'federated_connection_refresh_token_flow_failed',
            error_description: 'Refresh Token flow for the Federated Connection failed',
          },
          { status: 401 }
        )
      )
    );

    try {
      await exchangeForConnectionToken(config, store, 'google-oauth2');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenExchangeError);
      expect((err as TokenExchangeError).exitCode).toBe(4);
      expect((err as TokenExchangeError).message).toContain('google-oauth2');
      expect((err as TokenExchangeError).message).toContain('auth0-tv connect <service>');
    }
  });

  it('throws EXIT_AUTH_REQUIRED on expired_token', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json(
          { error: 'expired_token', error_description: 'Token expired' },
          { status: 401 }
        )
      )
    );

    try {
      await exchangeForConnectionToken(config, store, 'google-oauth2');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenExchangeError);
      expect((err as TokenExchangeError).exitCode).toBe(3);
    }
  });

  it('passes loginHint to the token exchange request', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    let capturedBody: Record<string, string> | undefined;
    msw.use(
      http.post('https://test.auth0.com/oauth/token', async ({ request }) => {
        capturedBody = await parseBody(request);
        return HttpResponse.json(mockExchangeResponse);
      })
    );

    await exchangeForConnectionToken(config, store, 'google-oauth2', {
      loginHint: 'user@example.com',
    });

    expect(capturedBody?.login_hint).toBe('user@example.com');
  });

  it('does not send login_hint when not provided', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    let capturedBody: Record<string, string> | undefined;
    msw.use(
      http.post('https://test.auth0.com/oauth/token', async ({ request }) => {
        capturedBody = await parseBody(request);
        return HttpResponse.json(mockExchangeResponse);
      })
    );

    await exchangeForConnectionToken(config, store, 'google-oauth2');
    expect(capturedBody).toBeDefined();
    expect('login_hint' in capturedBody!).toBe(false);
  });

  it('validates required scopes and throws when missing', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    msw.use(
      http.post('https://test.auth0.com/oauth/token', () =>
        HttpResponse.json({
          ...mockExchangeResponse,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        })
      )
    );

    try {
      await exchangeForConnectionToken(config, store, 'google-oauth2', {
        requiredScopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
        ],
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenExchangeError);
      expect((err as TokenExchangeError).exitCode).toBe(4);
      expect((err as TokenExchangeError).message).toContain('gmail.send');
    }
  });

  it('passes scope validation when all required scopes are present', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    const token = await exchangeForConnectionToken(config, store, 'google-oauth2', {
      requiredScopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });
    expect(token).toBe(mockExchangeResponse.access_token);
  });

  it('throws EXIT_AUTHZ_REQUIRED when response has no scope field and requiredScopes are set', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-auth0-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    msw.use(
      http.post('https://test.auth0.com/oauth/token', () => {
        const { scope: _, ...noScope } = mockExchangeResponse;
        return HttpResponse.json(noScope);
      })
    );

    try {
      await exchangeForConnectionToken(config, store, 'google-oauth2', {
        requiredScopes: ['https://www.googleapis.com/auth/gmail.modify'],
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TokenExchangeError);
      expect((err as TokenExchangeError).exitCode).toBe(4);
      expect((err as TokenExchangeError).message).toContain('Insufficient scopes');
      expect((err as TokenExchangeError).message).toContain('gmail.modify');
    }
  });
});
