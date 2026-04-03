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
  resolveService,
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

describe('connect --scopes flag', () => {
  it('merges extra scopes with service default scopes', () => {
    const gmailMapping = getServiceEntry('gmail')!;
    const extraScopes =
      'https://www.googleapis.com/auth/gmail.labels,https://www.googleapis.com/auth/gmail.settings.basic';
    const parsed = extraScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const scopes = [...new Set([...gmailMapping.scopes, ...parsed])];

    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.labels');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.settings.basic');
  });

  it('deduplicates extra scopes that overlap with service defaults', () => {
    const gmailMapping = getServiceEntry('gmail')!;
    const extraScopes =
      'https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.labels';
    const parsed = extraScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const scopes = [...new Set([...gmailMapping.scopes, ...parsed])];

    // gmail.modify should appear only once
    expect(scopes.filter((s) => s === 'https://www.googleapis.com/auth/gmail.modify')).toHaveLength(
      1
    );
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.labels');
  });

  it('handles empty --scopes gracefully', () => {
    const gmailMapping = getServiceEntry('gmail')!;
    const extraScopes = '';
    const parsed = extraScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const scopes = [...new Set([...gmailMapping.scopes, ...parsed])];

    expect(scopes).toEqual(gmailMapping.scopes);
  });

  it('trims whitespace from comma-separated scopes', () => {
    const gmailMapping = getServiceEntry('gmail')!;
    const extraScopes =
      ' https://www.googleapis.com/auth/gmail.labels , https://www.googleapis.com/auth/gmail.settings.basic ';
    const parsed = extraScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const scopes = [...new Set([...gmailMapping.scopes, ...parsed])];

    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.labels');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.settings.basic');
  });

  it('merges extra scopes with both service defaults and remote scopes', async () => {
    const msw = setupServer(...handlers);
    msw.listen({ onUnhandledRequest: 'bypass' });

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

    const calendarMapping = getServiceEntry('calendar')!;
    const extraScopes = 'https://www.googleapis.com/auth/calendar.settings.readonly';
    const parsed = extraScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Step 1: merge service defaults + extra scopes
    let scopes = [...new Set([...calendarMapping.scopes, ...parsed])];

    // Step 2: merge with remote scopes
    const remoteAccounts = await listConnectedAccounts(config, 'valid-refresh-token');
    const existing = remoteAccounts.find((a) => a.connection === calendarMapping.connection);
    if (existing?.scopes.length) {
      scopes = [...new Set([...scopes, ...existing.scopes])];
    }

    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.events');
    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.settings.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.modify');

    msw.close();
  });
});

describe('connect custom/unknown services', () => {
  const msw = setupServer(...handlers);
  let tempDir: string;
  let store: CredentialStore;

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-connect-custom-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    msw.resetHandlers();
    clearOidcConfigCache();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolveService returns unknown entry for custom service', () => {
    const resolved = resolveService('my-custom-idp');
    expect(resolved.isKnown).toBe(false);
    expect(resolved.connection).toBe('my-custom-idp');
    expect(resolved.scopes).toEqual([]);
    expect(resolved.allowedDomains).toEqual([]);
  });

  it('custom service uses only user-supplied scopes', () => {
    const resolved = resolveService('my-custom-idp');
    const extraScopes = 'read,write,profile';
    const parsed = extraScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const scopes = [...new Set([...resolved.scopes, ...parsed])];

    // Only user-supplied scopes, no defaults
    expect(scopes).toEqual(['read', 'write', 'profile']);
  });

  it('custom service saves allowed domains via service settings', async () => {
    const serviceName = 'my-custom-idp';
    const domains = ['api.example.com', '*.example.org'];

    await store.saveServiceSettings(serviceName, { allowedDomains: domains });
    const settings = await store.getServiceSettings(serviceName);
    expect(settings?.allowedDomains).toEqual(domains);
  });

  it('custom service can exchange tokens with any connection string', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600_000,
    });

    // Token exchange works with any connection name — Auth0 validates server-side
    const token = await exchangeForConnectionToken(config, store, 'my-custom-idp');
    expect(token).toBe(mockExchangeResponse.access_token);
  });

  it('custom service merges user scopes with remote scopes', async () => {
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'ca_custom1',
              connection: 'my-custom-idp',
              scopes: ['existing-scope'],
            },
          ],
        })
      )
    );

    const resolved = resolveService('my-custom-idp');
    const extraScopes = ['read', 'write'];
    let scopes = [...new Set([...resolved.scopes, ...extraScopes])];

    const remoteAccounts = await listConnectedAccounts(config, 'valid-refresh-token');
    const existing = remoteAccounts.find((a) => a.connection === resolved.connection);
    if (existing?.scopes.length) {
      scopes = [...new Set([...scopes, ...existing.scopes])];
    }

    expect(scopes).toContain('read');
    expect(scopes).toContain('write');
    expect(scopes).toContain('existing-scope');
  });
});
