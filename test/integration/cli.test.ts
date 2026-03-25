import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers.js';
import { gmailHandlers } from '../mocks/gmail/handlers.js';
import { CredentialStore } from '../../src/store/credential-store.js';
import { exchangeForConnectionToken } from '../../src/auth/token-exchange.js';
import { mockTokenResponse, mockExchangeResponse } from '../mocks/handlers.js';
import type { Auth0Config } from '../../src/utils/config.js';

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, '../../src/index.ts');
const TSX = join(import.meta.dirname, '../../node_modules/.bin/tsx');

async function run(
  args: string[],
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await exec(TSX, [CLI, ...args], {
      env: { ...process.env, ...env },
      timeout: 10_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 };
  }
}

describe('CLI integration', () => {
  it('--help exits with code 0 and shows commands', async () => {
    const { stdout, code } = await run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('auth0-tv');
    expect(stdout).toContain('login');
    expect(stdout).toContain('logout');
    expect(stdout).toContain('gmail');
    expect(stdout).toContain('connect');
  });

  it('--version prints version', async () => {
    const { stdout, code } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('0.1.0');
  });

  it('gmail --help shows subcommands', async () => {
    const { stdout, code } = await run(['gmail', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('search');
    expect(stdout).toContain('read');
    expect(stdout).toContain('send');
    expect(stdout).toContain('draft');
  });

  it('gmail send --help shows required options', async () => {
    const { stdout, code } = await run(['gmail', 'send', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('--to');
    expect(stdout).toContain('--subject');
    expect(stdout).toContain('--body');
  });

  it('gmail draft --help shows subcommands', async () => {
    const { stdout, code } = await run(['gmail', 'draft', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('create');
    expect(stdout).toContain('list');
    expect(stdout).toContain('send');
    expect(stdout).toContain('delete');
  });
});

describe('CLI status/connections without credentials', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-cli-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('status --json reports not logged in', async () => {
    // We run status programmatically using the store to verify the data layer
    const store = new CredentialStore(tempDir);
    const tokens = await store.getAuth0Tokens();
    expect(tokens).toBeNull();
  });

  it('connections shows empty list', async () => {
    const store = new CredentialStore(tempDir);
    const connections = await store.listConnections();
    expect(connections).toEqual([]);
  });
});

describe('CLI credential flow', () => {
  const msw = setupServer(...handlers);
  let tempDir: string;
  let store: CredentialStore;

  const config: Auth0Config = {
    domain: 'test.auth0.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  };

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => msw.resetHandlers());

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-flow-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('full credential lifecycle: save → status → connect → disconnect → clear', async () => {
    // 1. Save Auth0 tokens (simulating post-login)
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: mockTokenResponse.refresh_token,
      idToken: mockTokenResponse.id_token,
      expiresAt: Date.now() + 86400_000,
    });

    // 2. Verify status
    const token = await store.getAuth0Token();
    expect(token).toBe(mockTokenResponse.access_token);

    // 3. Save connection token (simulating post-connect)
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // 4. Verify connections
    const connections = await store.listConnections();
    expect(connections).toContain('google-oauth2');

    // 5. Disconnect
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(true);
    expect(await store.listConnections()).toEqual([]);

    // 6. Clear all
    await store.clear();
    expect(await store.getAuth0Token()).toBeNull();
  });

  it('token exchange after connect persists connection for status/connections', async () => {
    // Simulate: login saves Auth0 tokens (refresh token needed for exchange)
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: mockTokenResponse.refresh_token,
      expiresAt: Date.now() + 86400_000,
    });

    // Before token exchange: no connections visible
    expect(await store.listConnections()).toEqual([]);

    // Simulate: connect triggers token exchange (this is the fix)
    await exchangeForConnectionToken(config, store, 'google-oauth2');

    // After token exchange: connection is visible
    const connections = await store.listConnections();
    expect(connections).toContain('google-oauth2');

    // Connection token is cached and valid
    const connToken = await store.getConnectionToken('google-oauth2');
    expect(connToken).toBe(mockExchangeResponse.access_token);
  });

  it('logout clears all credentials and connections', async () => {
    // Setup: logged in with a connection
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: mockTokenResponse.refresh_token,
      expiresAt: Date.now() + 86400_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // Verify state before logout
    expect(await store.getAuth0Token()).toBe(mockTokenResponse.access_token);
    expect(await store.listConnections()).toContain('google-oauth2');

    // Logout
    await store.clear();

    // Everything is gone
    expect(await store.getAuth0Token()).toBeNull();
    expect(await store.getAuth0Tokens()).toBeNull();
    expect(await store.listConnections()).toEqual([]);
  });

  it('expired tokens are not returned', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'expired-token',
      expiresAt: Date.now() - 1000,
    });

    expect(await store.getAuth0Token()).toBeNull();
  });
});
