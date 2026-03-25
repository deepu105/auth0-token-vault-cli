import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CredentialStore } from '../../src/store/credential-store.js';
import type { CredentialBackend } from '../../src/store/backend.js';
import type { Auth0Tokens, ConnectionToken } from '../../src/store/types.js';

describe('CredentialStore', () => {
  let tempDir: string;
  let store: CredentialStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-test-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const validAuth0Tokens: Auth0Tokens = {
    accessToken: 'at-123',
    refreshToken: 'rt-456',
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
  };

  const expiredAuth0Tokens: Auth0Tokens = {
    accessToken: 'at-expired',
    expiresAt: Date.now() - 1000, // already expired
  };

  const validConnectionToken: ConnectionToken = {
    accessToken: 'gmail-token-abc',
    expiresAt: Date.now() + 60 * 60 * 1000,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  };

  // ── Auth0 tokens ──────────────────────────────────────────────

  it('saves and retrieves Auth0 tokens', async () => {
    await store.saveAuth0Tokens(validAuth0Tokens);

    const token = await store.getAuth0Token();
    expect(token).toBe('at-123');

    const full = await store.getAuth0Tokens();
    expect(full).toEqual(validAuth0Tokens);
  });

  it('returns null when no Auth0 tokens are stored', async () => {
    expect(await store.getAuth0Token()).toBeNull();
    expect(await store.getAuth0Tokens()).toBeNull();
  });

  it('returns null for expired Auth0 tokens', async () => {
    await store.saveAuth0Tokens(expiredAuth0Tokens);
    expect(await store.getAuth0Token()).toBeNull();
  });

  it('returns null when token is within the 5-minute expiry buffer', async () => {
    const almostExpired: Auth0Tokens = {
      accessToken: 'at-soon',
      expiresAt: Date.now() + 4 * 60 * 1000, // 4 min from now (within 5-min buffer)
    };
    await store.saveAuth0Tokens(almostExpired);
    expect(await store.getAuth0Token()).toBeNull();
  });

  // ── Connection tokens ─────────────────────────────────────────

  it('saves and retrieves connection tokens', async () => {
    await store.saveConnectionToken('google-oauth2', validConnectionToken);

    const token = await store.getConnectionToken('google-oauth2');
    expect(token).toBe('gmail-token-abc');

    const entry = await store.getConnectionEntry('google-oauth2');
    expect(entry).toEqual(validConnectionToken);
  });

  it('returns null for missing connection', async () => {
    expect(await store.getConnectionToken('google-oauth2')).toBeNull();
  });

  it('returns null for expired connection token', async () => {
    const expired: ConnectionToken = {
      accessToken: 'expired-gmail',
      expiresAt: Date.now() - 1000,
      scopes: [],
    };
    await store.saveConnectionToken('google-oauth2', expired);
    expect(await store.getConnectionToken('google-oauth2')).toBeNull();
  });

  it('lists connected services', async () => {
    await store.saveConnectionToken('google-oauth2', validConnectionToken);
    await store.saveConnectionToken('slack', { ...validConnectionToken, accessToken: 'slack-tok' });

    const connections = await store.listConnections();
    expect(connections).toEqual(['google-oauth2', 'slack']);
  });

  // ── Remove / clear ────────────────────────────────────────────

  it('removes a connection', async () => {
    await store.saveConnectionToken('google-oauth2', validConnectionToken);
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(true);
    expect(await store.getConnectionToken('google-oauth2')).toBeNull();
  });

  it('returns false when removing non-existent connection', async () => {
    expect(await store.removeConnection('unknown')).toBe(false);
  });

  it('clears all credentials', async () => {
    await store.saveAuth0Tokens(validAuth0Tokens);
    await store.saveConnectionToken('google-oauth2', validConnectionToken);

    await store.clear();

    expect(await store.getAuth0Token()).toBeNull();
    expect(await store.getConnectionToken('google-oauth2')).toBeNull();
  });

  it('clear() is safe when no file exists', async () => {
    // Should not throw
    await store.clear();
  });

  // ── File permissions ──────────────────────────────────────────

  it('creates credential file with 0600 permissions', async () => {
    await store.saveAuth0Tokens(validAuth0Tokens);
    const filePath = join(tempDir, 'credentials.json');
    const fileStat = await stat(filePath);
    // Check file permission bits (mask off file type)
    const mode = fileStat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  // ── Corrupt file handling ─────────────────────────────────────

  it('handles corrupt credential file gracefully', async () => {
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(join(tempDir, 'credentials.json'), 'not valid json');

    // Should not throw, returns empty state
    const token = await store.getAuth0Token();
    expect(token).toBeNull();
  });

  // ── Persistence round-trip ────────────────────────────────────

  it('persists data that survives a new store instance', async () => {
    await store.saveAuth0Tokens(validAuth0Tokens);
    await store.saveConnectionToken('google-oauth2', validConnectionToken);

    // Create a new store pointing at the same directory
    const store2 = new CredentialStore(tempDir);
    expect(await store2.getAuth0Token()).toBe('at-123');
    expect(await store2.getConnectionToken('google-oauth2')).toBe('gmail-token-abc');
  });
});

// ── CredentialStore with custom backend (keyring facade test) ───

describe('CredentialStore with CredentialBackend', () => {
  let mockBackend: CredentialBackend;
  let store: CredentialStore;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();

    // In-memory backend simulating keyring behavior
    mockBackend = {
      async getAuth0Tokens() {
        const raw = storage.get('AUTH0_TOKENS');
        return raw ? JSON.parse(raw) : null;
      },
      async saveAuth0Tokens(tokens) {
        storage.set('AUTH0_TOKENS', JSON.stringify(tokens));
      },
      async getConnectionToken(connection) {
        const raw = storage.get(`CONNECTION:${connection}`);
        return raw ? JSON.parse(raw) : null;
      },
      async saveConnectionToken(connection, token) {
        storage.set(`CONNECTION:${connection}`, JSON.stringify(token));
      },
      async listConnections() {
        return [...storage.keys()]
          .filter((k) => k.startsWith('CONNECTION:'))
          .map((k) => k.slice('CONNECTION:'.length));
      },
      async removeConnection(connection) {
        return storage.delete(`CONNECTION:${connection}`);
      },
      async clear() {
        storage.clear();
      },
    };

    store = new CredentialStore(mockBackend);
  });

  it('full lifecycle through custom backend', async () => {
    // Save Auth0 tokens
    await store.saveAuth0Tokens({
      accessToken: 'at-keyring',
      refreshToken: 'rt-keyring',
      expiresAt: Date.now() + 3600_000,
    });

    expect(await store.getAuth0Token()).toBe('at-keyring');
    const full = await store.getAuth0Tokens();
    expect(full?.refreshToken).toBe('rt-keyring');

    // Save connection
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-keyring',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    expect(await store.listConnections()).toEqual(['google-oauth2']);
    expect(await store.getConnectionToken('google-oauth2')).toBe('gmail-keyring');

    // Remove connection
    expect(await store.removeConnection('google-oauth2')).toBe(true);
    expect(await store.listConnections()).toEqual([]);

    // Clear all
    await store.clear();
    expect(await store.getAuth0Token()).toBeNull();
    expect(await store.getAuth0Tokens()).toBeNull();
  });

  it('expired tokens are filtered by facade, not backend', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'expired',
      expiresAt: Date.now() - 1000,
    });

    // Backend has the data
    expect(await store.getAuth0Tokens()).toBeDefined();
    // Facade filters expired
    expect(await store.getAuth0Token()).toBeNull();
  });

  it('expired connection tokens are filtered by facade', async () => {
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'expired-gmail',
      expiresAt: Date.now() - 1000,
      scopes: [],
    });

    // getConnectionEntry returns raw data
    expect(await store.getConnectionEntry('google-oauth2')).toBeDefined();
    // getConnectionToken filters expired
    expect(await store.getConnectionToken('google-oauth2')).toBeNull();
  });
});
