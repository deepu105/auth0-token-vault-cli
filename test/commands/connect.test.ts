import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupServer } from 'msw/node';
import { CredentialStore } from '../../src/store/credential-store.js';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import { exchangeForConnectionToken } from '../../src/auth/token-exchange.js';
import { handlers, mockExchangeResponse } from '../mocks/handlers.js';
import type { Auth0Config } from '../../src/utils/config.js';
import {
  getServiceEntry,
  getConnectionForService,
  getAvailableServices,
} from '../../src/utils/service-registry.js';

const config: Auth0Config = {
  domain: 'test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('connect command data', () => {
  const msw = setupServer(...handlers);
  let tempDir: string;
  let store: CredentialStore;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-connect-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    msw.resetHandlers();
    clearOidcConfigCache();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('validates service names via service registry', () => {
    // Known service
    const entry = getServiceEntry('gmail');
    expect(entry).toBeDefined();
    expect(entry!.connection).toBe('google-oauth2');

    // Unknown service
    expect(getServiceEntry('nonexistent')).toBeUndefined();

    // Available services list
    expect(getAvailableServices()).toContain('gmail');
  });

  it('requires login (refresh token) before connecting', async () => {
    const auth0Tokens = await store.getAuth0Tokens();
    // No tokens → command would exit with EXIT_AUTH_REQUIRED
    expect(auth0Tokens).toBeNull();
  });

  it('requires refresh token specifically', async () => {
    // Access token without refresh token → still can't connect
    await store.saveAuth0Tokens({
      accessToken: 'valid-token',
      expiresAt: Date.now() + 3600_000,
    });

    const tokens = await store.getAuth0Tokens();
    expect(tokens?.refreshToken).toBeUndefined();
  });

  it('clears stale cached connection token before connecting', async () => {
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'stale-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });

    // Command clears cache before re-authorizing
    await store.removeConnection('google-oauth2');
    expect(await store.getConnectionToken('google-oauth2')).toBeNull();
  });

  it('exchanges for connection token after successful connect', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    // Simulate the post-connect token exchange
    const token = await exchangeForConnectionToken(config, store, 'google-oauth2');
    expect(token).toBe(mockExchangeResponse.access_token);

    // Token should be cached now
    const cached = await store.getConnectionToken('google-oauth2');
    expect(cached).toBe(mockExchangeResponse.access_token);
  });

  it('resolves connection identifier from service name', () => {
    expect(getConnectionForService('gmail')).toBe('google-oauth2');
    expect(getConnectionForService('Gmail')).toBe('google-oauth2');
    expect(getConnectionForService('GMAIL')).toBe('google-oauth2');
    expect(getConnectionForService('unknown')).toBeUndefined();
  });
});
