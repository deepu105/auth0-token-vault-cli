import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Auth0Tokens, ConnectionToken } from '../../src/store/types.js';

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
    findCredentials: vi.fn(),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: vi.fn(),
}));

import keytar from 'keytar';
import { KeyringBackend } from '../../src/store/keyring-backend.js';

const SERVICE = 'auth0-tv';

describe('KeyringBackend', () => {
  let backend: KeyringBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new KeyringBackend();
  });

  const validAuth0Tokens: Auth0Tokens = {
    accessToken: 'at-123',
    refreshToken: 'rt-456',
    expiresAt: Date.now() + 3600_000,
  };

  const validConnectionToken: ConnectionToken = {
    accessToken: 'gmail-token-abc',
    expiresAt: Date.now() + 3600_000,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  };

  // ── Auth0 tokens ──────────────────────────────────────────────

  it('saves and retrieves Auth0 tokens', async () => {
    vi.mocked(keytar.setPassword).mockResolvedValue();
    vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(validAuth0Tokens));

    await backend.saveAuth0Tokens(validAuth0Tokens);
    expect(keytar.setPassword).toHaveBeenCalledWith(
      SERVICE,
      'AUTH0_TOKENS',
      JSON.stringify(validAuth0Tokens)
    );

    const result = await backend.getAuth0Tokens();
    expect(result).toEqual(validAuth0Tokens);
  });

  it('returns null when no Auth0 tokens exist', async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue(null);
    expect(await backend.getAuth0Tokens()).toBeNull();
  });

  it('returns null for corrupt Auth0 tokens', async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue('not-json');
    expect(await backend.getAuth0Tokens()).toBeNull();
  });

  // ── Connection tokens ─────────────────────────────────────────

  it('saves and retrieves connection tokens', async () => {
    vi.mocked(keytar.setPassword).mockResolvedValue();
    vi.mocked(keytar.getPassword).mockResolvedValue(JSON.stringify(validConnectionToken));

    await backend.saveConnectionToken('google-oauth2', validConnectionToken);
    expect(keytar.setPassword).toHaveBeenCalledWith(
      SERVICE,
      'CONNECTION:google-oauth2',
      JSON.stringify(validConnectionToken)
    );

    const result = await backend.getConnectionToken('google-oauth2');
    expect(result).toEqual(validConnectionToken);
  });

  it('returns null for missing connection token', async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue(null);
    expect(await backend.getConnectionToken('google-oauth2')).toBeNull();
  });

  it('returns null for corrupt connection token', async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue('bad-json');
    expect(await backend.getConnectionToken('google-oauth2')).toBeNull();
  });

  // ── List connections ──────────────────────────────────────────

  it('lists connections filtering by CONNECTION: prefix', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      { account: 'AUTH0_TOKENS', password: '{}' },
      { account: 'CONNECTION:google-oauth2', password: '{}' },
      { account: 'CONNECTION:github', password: '{}' },
    ]);

    const connections = await backend.listConnections();
    expect(connections).toEqual(['google-oauth2', 'github']);
  });

  it('returns empty list when no entries exist', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([]);
    expect(await backend.listConnections()).toEqual([]);
  });

  it('returns empty list when findCredentials fails', async () => {
    vi.mocked(keytar.findCredentials).mockRejectedValue(new Error('keyring unavailable'));
    expect(await backend.listConnections()).toEqual([]);
  });

  // ── Remove connection ─────────────────────────────────────────

  it('removes a connection', async () => {
    vi.mocked(keytar.deletePassword).mockResolvedValue(true);

    const removed = await backend.removeConnection('google-oauth2');
    expect(removed).toBe(true);
    expect(keytar.deletePassword).toHaveBeenCalledWith(SERVICE, 'CONNECTION:google-oauth2');
  });

  it('returns false when removing non-existent connection', async () => {
    vi.mocked(keytar.deletePassword).mockResolvedValue(false);
    expect(await backend.removeConnection('unknown')).toBe(false);
  });

  it('returns false when deletePassword throws', async () => {
    vi.mocked(keytar.deletePassword).mockRejectedValue(new Error('access denied'));
    expect(await backend.removeConnection('google-oauth2')).toBe(false);
  });

  // ── Clear ─────────────────────────────────────────────────────

  it('clears all entries', async () => {
    vi.mocked(keytar.findCredentials).mockResolvedValue([
      { account: 'AUTH0_TOKENS', password: '{}' },
      { account: 'CONNECTION:google-oauth2', password: '{}' },
    ]);
    vi.mocked(keytar.deletePassword).mockResolvedValue(true);

    await backend.clear();

    expect(keytar.deletePassword).toHaveBeenCalledTimes(2);
    expect(keytar.deletePassword).toHaveBeenCalledWith(SERVICE, 'AUTH0_TOKENS');
    expect(keytar.deletePassword).toHaveBeenCalledWith(SERVICE, 'CONNECTION:google-oauth2');
  });

  it('clear does not throw when keyring errors', async () => {
    vi.mocked(keytar.findCredentials).mockRejectedValue(new Error('no keyring'));
    await expect(backend.clear()).resolves.toBeUndefined();
  });

  // ── Error handling ────────────────────────────────────────────

  it('get returns null on keytar error', async () => {
    vi.mocked(keytar.getPassword).mockRejectedValue(new Error('access denied'));
    expect(await backend.getAuth0Tokens()).toBeNull();
    expect(await backend.getConnectionToken('google-oauth2')).toBeNull();
  });

  it('set throws on keytar error', async () => {
    vi.mocked(keytar.setPassword).mockRejectedValue(new Error('access denied'));
    await expect(backend.saveAuth0Tokens(validAuth0Tokens)).rejects.toThrow('access denied');
  });
});
