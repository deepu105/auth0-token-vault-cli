import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { CredentialStore } from '../../src/store/credential-store.js';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import { exchangeForConnectionToken } from '../../src/auth/token-exchange.js';
import { listConnectedAccounts } from '../../src/auth/connected-accounts.js';
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

describe('connect scope merging', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('merges existing remote scopes with target service scopes', async () => {
    // Remote has Gmail scopes already approved
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'ca_abc123',
              connection: 'google-oauth2',
              scopes: [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.modify',
              ],
            },
          ],
        })
      )
    );

    const remoteAccounts = await listConnectedAccounts(config, 'valid-refresh-token');
    const calendarMapping = getServiceEntry('calendar')!;
    const existing = remoteAccounts.find((a) => a.connection === calendarMapping.connection);

    // Merge: calendar registry scopes + existing remote Gmail scopes
    const scopes = [...new Set([...calendarMapping.scopes, ...(existing?.scopes ?? [])])];

    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
  });

  it('uses only target service scopes when no existing remote connection', async () => {
    // Remote has no accounts
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({ accounts: [] })
      )
    );

    const remoteAccounts = await listConnectedAccounts(config, 'valid-refresh-token');
    const gmailMapping = getServiceEntry('gmail')!;
    const existing = remoteAccounts.find((a) => a.connection === gmailMapping.connection);

    const scopes = [...new Set([...gmailMapping.scopes, ...(existing?.scopes ?? [])])];

    // Only Gmail's own registry scopes
    expect(scopes).toEqual(gmailMapping.scopes);
  });

  it('deduplicates when re-connecting the same service', async () => {
    // Remote already has Gmail scopes (subset of registry)
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'ca_abc123',
              connection: 'google-oauth2',
              scopes: ['https://www.googleapis.com/auth/gmail.modify'],
            },
          ],
        })
      )
    );

    const remoteAccounts = await listConnectedAccounts(config, 'valid-refresh-token');
    const gmailMapping = getServiceEntry('gmail')!;
    const existing = remoteAccounts.find((a) => a.connection === gmailMapping.connection);

    const scopes = [...new Set([...gmailMapping.scopes, ...(existing?.scopes ?? [])])];

    // gmail.modify appears once (deduplicated), all registry scopes present
    expect(scopes).toEqual(gmailMapping.scopes);
    expect(scopes.filter((s) => s === 'https://www.googleapis.com/auth/gmail.modify')).toHaveLength(
      1
    );
  });

  it('falls back to target service scopes when remote API fails', async () => {
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({ message: 'Server error' }, { status: 500 })
      )
    );

    const calendarMapping = getServiceEntry('calendar')!;
    let scopes = [...calendarMapping.scopes];

    try {
      const remoteAccounts = await listConnectedAccounts(config, 'valid-refresh-token');
      const existing = remoteAccounts.find((a) => a.connection === calendarMapping.connection);
      if (existing?.scopes.length) {
        scopes = [...new Set([...scopes, ...existing.scopes])];
      }
    } catch {
      // Non-fatal — proceed with just the target service's scopes
    }

    // Falls back to just calendar scopes
    expect(scopes).toEqual([
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ]);
  });

  it('does not merge scopes from unrelated connections', async () => {
    // Remote has both google-oauth2 and slack connections
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
              id: 'ca_def456',
              connection: 'sign-in-with-slack',
              scopes: ['chat:write', 'search:read'],
            },
          ],
        })
      )
    );

    const remoteAccounts = await listConnectedAccounts(config, 'valid-refresh-token');
    const calendarMapping = getServiceEntry('calendar')!;
    const existing = remoteAccounts.find((a) => a.connection === calendarMapping.connection);

    const scopes = [...new Set([...calendarMapping.scopes, ...(existing?.scopes ?? [])])];

    // Calendar + Gmail scopes merged, but NO Slack scopes
    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(scopes).not.toContain('chat:write');
    expect(scopes).not.toContain('search:read');
  });
});
