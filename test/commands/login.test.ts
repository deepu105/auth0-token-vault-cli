import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CredentialStore } from '../../src/store/credential-store.js';
import { mockTokenResponse } from '../mocks/handlers.js';

describe('login command data', () => {
  let tempDir: string;
  let store: CredentialStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-login-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('saves config after login', async () => {
    await store.saveConfig({
      domain: 'test.auth0.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });

    const config = await store.getConfig();
    expect(config).toEqual({
      domain: 'test.auth0.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
  });

  it('saves auth0 tokens after successful PKCE flow', async () => {
    // Simulate what the login command does after runPkceFlow returns
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: mockTokenResponse.refresh_token,
      idToken: mockTokenResponse.id_token,
      expiresAt: Date.now() + mockTokenResponse.expires_in * 1000,
    });

    const tokens = await store.getAuth0Tokens();
    expect(tokens).not.toBeNull();
    expect(tokens!.accessToken).toBe(mockTokenResponse.access_token);
    expect(tokens!.refreshToken).toBe(mockTokenResponse.refresh_token);
  });

  it('detects existing login before re-authenticating', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'existing-token',
      expiresAt: Date.now() + 3600_000,
    });

    const existingToken = await store.getAuth0Token();
    expect(existingToken).toBe('existing-token');
  });

  it('overwrites old tokens on re-login', async () => {
    // First login
    await store.saveAuth0Tokens({
      accessToken: 'old-token',
      expiresAt: Date.now() + 3600_000,
    });

    // Second login
    await store.saveAuth0Tokens({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 3600_000,
    });

    const tokens = await store.getAuth0Tokens();
    expect(tokens!.accessToken).toBe('new-token');
    expect(tokens!.refreshToken).toBe('new-refresh');
  });
});
