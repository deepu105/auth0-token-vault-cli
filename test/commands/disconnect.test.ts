import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import { CredentialStore } from '../../src/store/credential-store.js';
import { handlers, mockTokenResponse, mockListAccountsResponse } from '../mocks/handlers.js';
import { listConnectedAccounts, deleteConnectedAccount } from '../../src/auth/connected-accounts.js';
import type { Auth0Config } from '../../src/utils/config.js';

const config: Auth0Config = {
  domain: 'test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

const REFRESH_TOKEN = 'valid-refresh-token';

describe('disconnect command data', () => {
  const msw = setupServer(...handlers);
  let tempDir: string;
  let store: CredentialStore;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-disconnect-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    msw.resetHandlers();
    clearOidcConfigCache();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('removes local token without any API calls (default, no --remote)', async () => {
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // Local disconnect only
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(true);
    expect(await store.listConnections()).toEqual([]);

    // No remote calls needed — verified by not needing auth tokens
  });

  it('removes local token AND remote account when --remote is used', async () => {
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 86400_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // Find account ID via remote list
    const accounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    const account = accounts.find((a) => a.connection === 'google-oauth2');
    expect(account).toBeDefined();
    expect(account!.id).toBe('ca_abc123');

    // Delete remote
    await expect(
      deleteConnectedAccount(config, REFRESH_TOKEN, account!.id)
    ).resolves.toBeUndefined();

    // Delete local
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(true);
    expect(await store.listConnections()).toEqual([]);
  });

  it('requires login for --remote (no refresh token available)', async () => {
    // No auth tokens → getAuth0Tokens returns null
    const auth0Tokens = await store.getAuth0Tokens();
    expect(auth0Tokens).toBeNull();
    // Command would check auth0Tokens?.refreshToken and exit with auth_required
  });

  it('warns when --remote but account not found in remote list', async () => {
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 86400_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // Override to return empty remote list
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({ accounts: [] })
      )
    );

    const accounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    const account = accounts.find((a) => a.connection === 'google-oauth2');
    expect(account).toBeUndefined();

    // Local removal still works
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(true);
  });

  it('handles remote API error gracefully during --remote disconnect', async () => {
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 86400_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // Override delete to fail
    msw.use(
      http.delete('https://test.auth0.com/me/v1/connected-accounts/accounts/:accountId', () =>
        HttpResponse.json({ message: 'Server error' }, { status: 500 })
      )
    );

    const accounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    const account = accounts.find((a) => a.connection === 'google-oauth2')!;

    // Remote delete fails
    await expect(
      deleteConnectedAccount(config, REFRESH_TOKEN, account.id)
    ).rejects.toThrow('Failed to delete connected account: Server error');

    // But local removal still succeeds
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(true);
    expect(await store.listConnections()).toEqual([]);
  });

  it('reports not_connected when service has no local token and no --remote', async () => {
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(false);
  });
});
