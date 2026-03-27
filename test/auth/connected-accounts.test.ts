import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import type { Auth0Config } from '../../src/utils/config.js';
import { handlers, mockConnectCompleteResponse } from '../mocks/handlers.js';

/**
 * Shared state between the MSW initiate handler and the `open` mock.
 * The initiate handler captures redirect_uri + state from the request,
 * and the `open` mock uses them to simulate Auth0's redirect to the callback.
 */
const { testCallback } = vi.hoisted(() => ({
  testCallback: {
    redirectUri: '',
    state: '',
    // Controls what the mock browser sends back:
    mode: 'success' as 'success' | 'error' | 'wrong-state',
  },
}));

// Mock `open` to simulate the browser flow:
// Auth0 shows consent → redirects to redirect_uri with connect_code + state
vi.mock('open', () => ({
  default: async () => {
    let url: string;
    switch (testCallback.mode) {
      case 'error':
        url = `${testCallback.redirectUri}?error=access_denied&error_description=User+denied`;
        break;
      case 'wrong-state':
        url = `${testCallback.redirectUri}?connect_code=mock-code&state=wrong-state`;
        break;
      default:
        url = `${testCallback.redirectUri}?connect_code=mock-connect-code&state=${testCallback.state}`;
    }
    await fetch(url).catch(() => {});
  },
}));

import {
  listConnectedAccounts,
  deleteConnectedAccount,
  runConnectedAccountFlow,
} from '../../src/auth/connected-accounts.js';

const config: Auth0Config = {
  domain: 'test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

const REFRESH_TOKEN = 'valid-refresh-token';

/** MSW handler that captures redirect_uri/state from the initiate POST */
function connectInitiateHandler() {
  return http.post(
    'https://test.auth0.com/me/v1/connected-accounts/connect',
    async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      testCallback.redirectUri = body.redirect_uri as string;
      testCallback.state = body.state as string;
      return HttpResponse.json({
        auth_session: 'test-auth-session',
        connect_uri: 'https://test.auth0.com/connected-accounts/connect',
        connect_params: { ticket: 'test-ticket' },
        expires_in: 300,
      });
    }
  );
}

describe('listConnectedAccounts', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('returns list of connected accounts', async () => {
    const accounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toEqual({
      id: 'ca_abc123',
      connection: 'google-oauth2',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });
    expect(accounts[1]).toEqual({
      id: 'ca_def456',
      connection: 'slack',
      scopes: ['chat:write'],
    });
  });

  it('returns empty array when no accounts', async () => {
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({ accounts: [] })
      )
    );

    const accounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    expect(accounts).toEqual([]);
  });

  it('returns empty array when accounts field is missing', async () => {
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({})
      )
    );

    const accounts = await listConnectedAccounts(config, REFRESH_TOKEN);
    expect(accounts).toEqual([]);
  });

  it('throws on API error', async () => {
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
      )
    );

    await expect(listConnectedAccounts(config, REFRESH_TOKEN)).rejects.toThrow(
      'Failed to list connected accounts: Forbidden'
    );
  });

  it('throws with HTTP status when error body has no message', async () => {
    msw.use(
      http.get('https://test.auth0.com/me/v1/connected-accounts/accounts', () =>
        HttpResponse.json({}, { status: 500 })
      )
    );

    await expect(listConnectedAccounts(config, REFRESH_TOKEN)).rejects.toThrow(
      'Failed to list connected accounts: HTTP 500'
    );
  });
});

describe('deleteConnectedAccount', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('deletes a connected account successfully', async () => {
    await expect(
      deleteConnectedAccount(config, REFRESH_TOKEN, 'ca_abc123')
    ).resolves.toBeUndefined();
  });

  it('throws on API error', async () => {
    msw.use(
      http.delete('https://test.auth0.com/me/v1/connected-accounts/accounts/:accountId', () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 })
      )
    );

    await expect(deleteConnectedAccount(config, REFRESH_TOKEN, 'ca_nonexistent')).rejects.toThrow(
      'Failed to delete connected account: Not found'
    );
  });
});

describe('runConnectedAccountFlow', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  beforeEach(() => {
    testCallback.mode = 'success';
    testCallback.redirectUri = '';
    testCallback.state = '';
  });
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('completes the full flow with simulated browser callback', async () => {
    msw.use(
      connectInitiateHandler(),
      http.post('https://test.auth0.com/me/v1/connected-accounts/complete', () =>
        HttpResponse.json(mockConnectCompleteResponse)
      )
    );

    const result = await runConnectedAccountFlow({
      config,
      refreshToken: REFRESH_TOKEN,
      connection: 'google-oauth2',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    expect(result).toEqual({
      id: mockConnectCompleteResponse.id,
      connection: mockConnectCompleteResponse.connection,
      scopes: mockConnectCompleteResponse.scopes,
    });
  }, 10_000);

  it('rejects on initiate API failure', async () => {
    msw.use(
      http.post('https://test.auth0.com/me/v1/connected-accounts/connect', () =>
        HttpResponse.json({ message: 'Bad Request' }, { status: 400 })
      )
    );

    await expect(
      runConnectedAccountFlow({
        config,
        refreshToken: REFRESH_TOKEN,
        connection: 'google-oauth2',
        scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      })
    ).rejects.toThrow('Failed to initiate connected account: Bad Request');
  }, 10_000);

  it('rejects on callback error parameter', async () => {
    testCallback.mode = 'error';
    msw.use(connectInitiateHandler());

    await expect(
      runConnectedAccountFlow({
        config,
        refreshToken: REFRESH_TOKEN,
        connection: 'google-oauth2',
        scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      })
    ).rejects.toThrow('Authorization error: User denied');
  }, 10_000);

  it('rejects on state mismatch', async () => {
    testCallback.mode = 'wrong-state';
    msw.use(connectInitiateHandler());

    await expect(
      runConnectedAccountFlow({
        config,
        refreshToken: REFRESH_TOKEN,
        connection: 'google-oauth2',
        scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      })
    ).rejects.toThrow('State mismatch');
  }, 10_000);

  it('rejects on complete API failure', async () => {
    msw.use(
      connectInitiateHandler(),
      http.post('https://test.auth0.com/me/v1/connected-accounts/complete', () =>
        HttpResponse.json({ message: 'Server error' }, { status: 500 })
      )
    );

    await expect(
      runConnectedAccountFlow({
        config,
        refreshToken: REFRESH_TOKEN,
        connection: 'google-oauth2',
        scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      })
    ).rejects.toThrow('Failed to complete connected account: Server error');
  }, 10_000);
});
