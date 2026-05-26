import { afterEach, describe, expect, it } from 'vitest';
import { setupE2eFixture, type E2eFixture } from './helpers.js';

function parseJson(result: { stdout: string }) {
  return JSON.parse(result.stdout);
}

async function login(fixture: E2eFixture) {
  const result = await fixture.run(['--json', 'login']);
  expect(result.code).toBe(0);
  expect(parseJson(result)).toEqual({ status: 'logged_in' });
}

async function loginAndConnectGmail(fixture: E2eFixture, args: string[] = []) {
  await login(fixture);
  const result = await fixture.run(['--json', 'connect', 'gmail', ...args]);
  expect(result.code).toBe(0);
  return parseJson(result);
}

describe.sequential('CLI e2e', () => {
  let fixture: E2eFixture | undefined;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = undefined;
    }
  });

  it('runs login, status, connect, connections, gmail search, and logout against the built CLI', async () => {
    fixture = await setupE2eFixture();

    await login(fixture);

    const storedTokens = await fixture.store.getAuth0Tokens();
    expect(storedTokens?.refreshToken).toBe('mock-refresh-token');

    const statusResult = await fixture.run(['--json', 'status']);
    expect(statusResult.code).toBe(0);
    expect(parseJson(statusResult)).toMatchObject({
      loggedIn: true,
      domain: 'test.auth0.com',
      clientId: 'test-client-id',
      storage: 'file',
      connections: [],
      tokenStatus: 'valid',
    });

    const connectResult = await fixture.run(['--json', 'connect', 'gmail']);
    expect(connectResult.code).toBe(0);
    expect(parseJson(connectResult)).toMatchObject({
      status: 'connected',
      service: 'gmail',
      connection: 'google-oauth2',
    });

    expect(await fixture.store.listConnections()).toContain('google-oauth2');
    expect(await fixture.store.getConnectionToken('google-oauth2')).toBe(
      'mock-google-oauth2-access-token'
    );

    const connectionsResult = await fixture.run(['--json', 'connections']);
    expect(connectionsResult.code).toBe(0);
    expect(parseJson(connectionsResult)).toMatchObject({
      connections: [
        expect.objectContaining({
          connection: 'google-oauth2',
          service: 'gmail, calendar',
          tokenStatus: 'valid',
          remote: true,
        }),
      ],
    });

    const searchResult = await fixture.run(['--json', 'gmail', 'search', 'from:test@example.com']);
    expect(searchResult.code).toBe(0);
    expect(parseJson(searchResult)).toMatchObject({
      data: {
        resultSizeEstimate: 2,
        messages: [
          expect.objectContaining({
            id: 'msg-1',
            subject: 'Test subject msg-1',
            from: 'sender@example.com',
          }),
          expect.objectContaining({
            id: 'msg-2',
            subject: 'Test subject msg-2',
          }),
        ],
      },
    });

    const logoutResult = await fixture.run(['--json', 'logout', '--local']);
    expect(logoutResult.code).toBe(0);
    expect(parseJson(logoutResult)).toEqual({ status: 'logged_out' });

    expect(await fixture.store.getAuth0Tokens()).toBeNull();
    expect(await fixture.store.listConnections()).toEqual([]);
  });

  it('reports unauthenticated status for status, connections, and logout', async () => {
    fixture = await setupE2eFixture();

    const statusResult = await fixture.run(['--json', 'status']);
    expect(statusResult.code).toBe(0);
    expect(parseJson(statusResult)).toMatchObject({
      loggedIn: false,
      domain: 'test.auth0.com',
      clientId: 'test-client-id',
    });

    const connectionsResult = await fixture.run(['--json', 'connections']);
    expect(connectionsResult.code).toBe(0);
    expect(parseJson(connectionsResult)).toEqual({ connections: [] });

    const logoutResult = await fixture.run(['--json', 'logout', '--local']);
    expect(logoutResult.code).toBe(0);
    expect(parseJson(logoutResult)).toEqual({ status: 'not_logged_in' });
  });

  it('requires a connected service before gmail commands can exchange tokens', async () => {
    fixture = await setupE2eFixture();

    await login(fixture);

    const result = await fixture.run(['--json', 'gmail', 'search', 'from:test@example.com']);
    expect(result.code).toBe(4);
    expect(parseJson(result)).toEqual({
      error: {
        code: 'token_exchange_error',
        message: 'Connection google-oauth2 not authorized. Run `auth0-tv connect <service>` first.',
      },
    });
  });

  it('returns a single JSON payload when logging in again with an existing session', async () => {
    fixture = await setupE2eFixture();

    await login(fixture);

    const result = await fixture.run(['--json', 'login']);
    expect(result.code).toBe(0);
    expect(() => parseJson(result)).not.toThrow();
    expect(parseJson(result)).toEqual({
      status: 'logged_in',
      reauthenticated: true,
    });
  });

  it('persists allowed domains and uses them for authenticated fetches', async () => {
    fixture = await setupE2eFixture();

    const connectData = await loginAndConnectGmail(fixture, [
      '--allowed-domains',
      'api.example.test',
    ]);
    expect(connectData).toMatchObject({
      status: 'connected',
      service: 'gmail',
      connection: 'google-oauth2',
      allowedDomains: ['api.example.test'],
    });

    expect(await fixture.store.getServiceSettings('gmail')).toEqual({
      allowedDomains: ['api.example.test'],
    });

    const fetchResult = await fixture.run([
      '--json',
      'fetch',
      'gmail',
      'https://api.example.test/echo',
    ]);
    expect(fetchResult.code).toBe(0);
    expect(parseJson(fetchResult)).toEqual({
      status: 200,
      body: {
        ok: true,
        method: 'GET',
        authorization: 'Bearer mock-google-oauth2-access-token',
      },
    });
  });

  it('rejects fetch requests to disallowed domains', async () => {
    fixture = await setupE2eFixture();

    await loginAndConnectGmail(fixture);

    const result = await fixture.run(['--json', 'fetch', 'gmail', 'https://example.com/data']);
    expect(result.code).toBe(2);
    expect(parseJson(result)).toEqual({
      error: {
        code: 'domain_not_allowed',
        message:
          'Domain "example.com" is not in the allowed list for gmail. Allowed: *.googleapis.com',
      },
    });
  });

  it('supports local-only and remote disconnect flows distinctly', async () => {
    fixture = await setupE2eFixture();

    await loginAndConnectGmail(fixture);

    const localDisconnect = await fixture.run(['--json', 'disconnect', 'gmail']);
    expect(localDisconnect.code).toBe(0);
    expect(parseJson(localDisconnect)).toEqual({
      status: 'disconnected',
      service: 'gmail',
      remote: false,
    });

    const afterLocalDisconnect = await fixture.run(['--json', 'connections']);
    expect(afterLocalDisconnect.code).toBe(0);
    expect(parseJson(afterLocalDisconnect)).toMatchObject({
      connections: [
        expect.objectContaining({
          connection: 'google-oauth2',
          tokenStatus: 'none',
          remote: true,
        }),
      ],
    });

    const remoteDisconnect = await fixture.run(['--json', 'disconnect', 'gmail', '--remote']);
    expect(remoteDisconnect.code).toBe(0);
    expect(parseJson(remoteDisconnect)).toEqual({
      status: 'disconnected',
      service: 'gmail',
      remote: true,
    });

    const finalConnections = await fixture.run(['--json', 'connections']);
    expect(finalConnections.code).toBe(0);
    expect(parseJson(finalConnections)).toEqual({ connections: [] });
  });

  it('requires login before remote disconnect', async () => {
    fixture = await setupE2eFixture();

    const result = await fixture.run(['--json', 'disconnect', 'gmail', '--remote']);
    expect(result.code).toBe(3);
    expect(parseJson(result)).toEqual({
      error: {
        code: 'auth_required',
        message: 'Not logged in. Run `auth0-tv login` first.',
      },
    });
  });

  it('accepts custom connection names for connect, disconnect, and fetch', async () => {
    fixture = await setupE2eFixture();

    await login(fixture);

    // Connect a custom service with scopes and allowed domains
    const connectResult = await fixture.run([
      '--json',
      'connect',
      'custom-idp',
      '--scopes',
      'read,write',
      '--allowed-domains',
      'api.example.test',
    ]);
    expect(connectResult.code).toBe(0);
    const connectData = parseJson(connectResult);
    expect(connectData).toMatchObject({
      status: 'connected',
      service: 'custom-idp',
      connection: 'custom-idp',
      allowedDomains: ['api.example.test'],
    });

    // Verify it appears in connections
    const connectionsResult = await fixture.run(['--json', 'connections']);
    expect(connectionsResult.code).toBe(0);
    const connections = parseJson(connectionsResult).connections;
    const customConn = connections.find((c) => c.connection === 'custom-idp');
    expect(customConn).toBeDefined();
    expect(customConn.tokenStatus).toBe('valid');
    expect(customConn.service).toBe('custom-idp');

    // Fetch using the custom connection
    const fetchResult = await fixture.run([
      '--json',
      'fetch',
      'custom-idp',
      'https://api.example.test/echo',
    ]);
    expect(fetchResult.code).toBe(0);
    expect(parseJson(fetchResult)).toEqual({
      status: 200,
      body: {
        ok: true,
        method: 'GET',
        authorization: 'Bearer mock-custom-idp-access-token',
      },
    });

    // Fetch to a disallowed domain fails
    const badFetchResult = await fixture.run([
      '--json',
      'fetch',
      'custom-idp',
      'https://evil.com/data',
    ]);
    expect(badFetchResult.code).toBe(2);
    expect(parseJson(badFetchResult).error.code).toBe('domain_not_allowed');

    // Disconnect the custom service
    const disconnectResult = await fixture.run(['--json', 'disconnect', 'custom-idp']);
    expect(disconnectResult.code).toBe(0);
    expect(parseJson(disconnectResult)).toEqual({
      status: 'disconnected',
      service: 'custom-idp',
      remote: false,
    });
  });

  it('rejects fetch to custom connection with no allowed domains', async () => {
    fixture = await setupE2eFixture();

    await login(fixture);

    // Connect without --allowed-domains
    const connectResult = await fixture.run(['--json', 'connect', 'no-domains-idp']);
    expect(connectResult.code).toBe(0);

    // Fetch should fail with no_allowed_domains
    const fetchResult = await fixture.run([
      '--json',
      'fetch',
      'no-domains-idp',
      'https://api.example.test/echo',
    ]);
    expect(fetchResult.code).toBe(2);
    expect(parseJson(fetchResult).error.code).toBe('no_allowed_domains');
  });

  it('preserves config after local logout so status still shows tenant details', async () => {
    fixture = await setupE2eFixture();

    await loginAndConnectGmail(fixture);

    const logoutResult = await fixture.run(['--json', 'logout', '--local']);
    expect(logoutResult.code).toBe(0);

    const statusResult = await fixture.run(['--json', 'status']);
    expect(statusResult.code).toBe(0);
    expect(parseJson(statusResult)).toMatchObject({
      loggedIn: false,
      domain: 'test.auth0.com',
      clientId: 'test-client-id',
    });
  });

  it('requires --confirm for destructive actions in non-interactive mode', async () => {
    fixture = await setupE2eFixture();

    const result = await fixture.run(['--json', 'gmail', 'delete', 'msg-1']);
    expect(result.code).toBe(2);
    expect(parseJson(result)).toEqual({
      error: {
        code: 'confirmation_required',
        message:
          'Destructive action "Delete message msg-1" requires --confirm or --yes flag in non-interactive mode.',
      },
    });
  });

  it('init: creates new app with --app-name', async () => {
    fixture = await setupE2eFixture();

    // --app-name skips the interactive prompt; non-TTY skips connection selection
    const result = await fixture.runInitWithStdin(['init', '--app-name', 'My Test App'], '');

    expect(result.code).toBe(0);

    // Verify setup wizard output
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Setup Wizard');
    expect(combined).toContain('Credentials retrieved');
    expect(combined).toContain('Setup complete');

    // After init, verify status shows logged in
    const status = await fixture.run(['--json', 'status']);
    expect(status.code).toBe(0);
    const json = parseJson(status);
    expect(json.loggedIn).toBe(true);
    expect(json.domain).toBe('test.auth0.com');
    expect(json.clientId).toBe('test-client-id');
  });

  it('init: uses existing app with --app-id', async () => {
    fixture = await setupE2eFixture();

    // --app-id uses an existing application by client ID
    const result = await fixture.runInitWithStdin(['init', '--app-id', 'test-client-id'], '');

    expect(result.code).toBe(0);

    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Setup Wizard');
    expect(combined).toContain('Token Vault Test App');
    expect(combined).toContain('Credentials retrieved');
    expect(combined).toContain('Setup complete');

    // Verify credentials were persisted
    const status = await fixture.run(['--json', 'status']);
    expect(status.code).toBe(0);
    const json = parseJson(status);
    expect(json.loggedIn).toBe(true);
    expect(json.domain).toBe('test.auth0.com');
    expect(json.clientId).toBe('test-client-id');
  });

  it('init: configures Token Vault grant types and connected accounts', async () => {
    fixture = await setupE2eFixture();

    const result = await fixture.runInitWithStdin(['init', '--app-name', 'Grant Test'], '');

    expect(result.code).toBe(0);

    // Verify all configuration steps ran
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Auth0 CLI detected');
    expect(combined).toContain('Connected to tenant');
    expect(combined).toContain('Application created');
    expect(combined).toContain('Application configured for Token Vault');
    expect(combined).toContain('Connected Accounts configured');
  });

  it('init: fails in non-interactive mode', async () => {
    fixture = await setupE2eFixture();

    // run() does not set AUTH0_TV_FORCE_INTERACTIVE, so init sees non-TTY stdin
    const result = await fixture.run(['--json', 'init']);

    expect(result.code).not.toBe(0);
    // Check either stderr or JSON error output
    const combined = result.stderr + result.stdout;
    expect(combined).toContain('interactive terminal');
  });
});
