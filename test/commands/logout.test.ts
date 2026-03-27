import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CredentialStore } from '../../src/store/credential-store.js';

describe('logout command data', () => {
  let tempDir: string;
  let store: CredentialStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-logout-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reports not logged in when no tokens exist', async () => {
    const tokens = await store.getAuth0Tokens();
    expect(tokens).toBeNull();
  });

  it('clears all credentials and connections on logout', async () => {
    // Set up logged-in state
    await store.saveConfig({
      domain: 'test.auth0.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
    await store.saveAuth0Tokens({
      accessToken: 'at-123',
      refreshToken: 'rt-456',
      expiresAt: Date.now() + 3600_000,
    });
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // Verify everything is stored
    expect(await store.getAuth0Tokens()).not.toBeNull();
    expect(await store.listConnections()).toContain('google-oauth2');

    // Logout clears tokens and connections
    await store.clear();

    expect(await store.getAuth0Tokens()).toBeNull();
    expect(await store.listConnections()).toEqual([]);

    // Config is preserved after logout
    const config = await store.getConfig();
    expect(config).not.toBeNull();
    expect(config!.domain).toBe('test.auth0.com');
  });

  it('clear is idempotent (can clear when already empty)', async () => {
    // No tokens stored — clear should not throw
    await expect(store.clear()).resolves.toBeUndefined();
  });
});
