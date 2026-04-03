import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import { CredentialStore, EXPIRY_BUFFER_MS } from '../../src/store/credential-store.js';
import { handlers, mockTokenResponse, mockListAccountsResponse } from '../mocks/handlers.js';
import { listConnectedAccounts } from '../../src/auth/connected-accounts.js';
import { requireConfig, type Auth0Config } from '../../src/utils/config.js';
import { getServicesForConnection } from '../../src/utils/service-registry.js';

const config: Auth0Config = {
  domain: 'test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

const REFRESH_TOKEN = 'valid-refresh-token';

describe('connections command data', () => {
  const msw = setupServer(...handlers);
  let tempDir: string;
  let store: CredentialStore;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-connections-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    msw.resetHandlers();
    clearOidcConfigCache();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns remote accounts with local token status when logged in', async () => {
    // Setup: logged in with refresh token + local gmail connection
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

    const remoteAccounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    expect(remoteAccounts).toHaveLength(2);

    // Build merged entries like the command does
    const entries = await Promise.all(
      remoteAccounts.map(async (acct) => {
        const localEntry = await store.getConnectionEntry(acct.connection);
        const tokenStatus = localEntry
          ? Date.now() >= localEntry.expiresAt - EXPIRY_BUFFER_MS
            ? 'expired'
            : 'valid'
          : 'none';
        return {
          connection: acct.connection,
          id: acct.id,
          scopes: acct.scopes,
          tokenStatus,
          remote: true,
        };
      })
    );

    // google-oauth2 has a local token → valid
    expect(entries[0]).toMatchObject({
      connection: 'google-oauth2',
      id: 'ca_abc123',
      tokenStatus: 'valid',
      remote: true,
    });

    // slack has no local token → none
    expect(entries[1]).toMatchObject({
      connection: 'slack',
      id: 'ca_def456',
      tokenStatus: 'none',
      remote: true,
    });
  });

  it('returns all remote accounts with tokenStatus none when no local tokens exist', async () => {
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 86400_000,
    });

    const remoteAccounts = await listConnectedAccounts(config, REFRESH_TOKEN);

    const entries = await Promise.all(
      remoteAccounts.map(async (acct) => {
        const localEntry = await store.getConnectionEntry(acct.connection);
        return { connection: acct.connection, tokenStatus: localEntry ? 'valid' : 'none' };
      })
    );

    expect(entries.every((e) => e.tokenStatus === 'none')).toBe(true);
  });

  it('falls back to local-only when not logged in (no refresh token)', async () => {
    // No auth0 tokens at all
    const auth0Tokens = await store.getAuth0Tokens();
    expect(auth0Tokens).toBeNull();
    // Local connections fallback
    const connections = await store.listConnections();
    expect(connections).toEqual([]);
  });

  it('falls back to local-only when remote API fails', async () => {
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

    // Override to fail
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({ message: 'Internal error' }, { status: 500 })
      )
    );

    // Remote call should throw
    await expect(listConnectedAccounts(config, REFRESH_TOKEN)).rejects.toThrow();

    // But local connections still available as fallback
    const localConnections = await store.listConnections();
    expect(localConnections).toContain('google-oauth2');
  });

  it('shows empty list when no connections exist remotely or locally', async () => {
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 86400_000,
    });

    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({ accounts: [] })
      )
    );

    const remoteAccounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    expect(remoteAccounts).toEqual([]);

    const localConnections = await store.listConnections();
    expect(localConnections).toEqual([]);
  });

  it('shows expired tokenStatus for locally expired tokens', async () => {
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 86400_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'expired-gmail-token',
      expiresAt: Date.now() - 1000, // already expired
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    const remoteAccounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    const acct = remoteAccounts.find((a) => a.connection === 'google-oauth2')!;
    const localEntry = await store.getConnectionEntry(acct.connection);
    const tokenStatus = localEntry
      ? Date.now() >= localEntry.expiresAt - EXPIRY_BUFFER_MS
        ? 'expired'
        : 'valid'
      : 'none';

    expect(tokenStatus).toBe('expired');
  });

  it('displays custom connections using raw connection name', async () => {
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: REFRESH_TOKEN,
      expiresAt: Date.now() + 86400_000,
    });

    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'ca_abc123',
              connection: 'google-oauth2',
              scopes: ['https://www.googleapis.com/auth/gmail.modify'],
            },
            {
              id: 'ca_custom1',
              connection: 'my-custom-idp',
              scopes: ['read', 'write'],
            },
          ],
        })
      )
    );

    const remoteAccounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    const entries = remoteAccounts.map((acct) => {
      const services = getServicesForConnection(acct.connection);
      return {
        connection: acct.connection,
        service: services.join(', ') || acct.connection,
      };
    });

    // Known connection shows service names
    expect(entries[0].service).toBe('gmail, calendar');
    // Custom connection falls back to raw connection name
    expect(entries[1].service).toBe('my-custom-idp');
  });
});
