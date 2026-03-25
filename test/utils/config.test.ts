import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfigFromEnv, loadConfigFromStore, requireConfig, resolveStorageBackend } from '../../src/utils/config.js';
import { CredentialStore } from '../../src/store/credential-store.js';

// ── resolveStorageBackend ─────────────────────────────────────

describe('resolveStorageBackend', () => {
  const originalEnv = process.env.AUTH0_TV_STORAGE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AUTH0_TV_STORAGE;
    } else {
      process.env.AUTH0_TV_STORAGE = originalEnv;
    }
  });

  it('defaults to keyring when no env var', () => {
    delete process.env.AUTH0_TV_STORAGE;
    expect(resolveStorageBackend()).toBe('keyring');
  });

  it('uses env var value', () => {
    process.env.AUTH0_TV_STORAGE = 'file';
    expect(resolveStorageBackend()).toBe('file');
  });

  it('throws on invalid env var value', () => {
    process.env.AUTH0_TV_STORAGE = 'invalid';
    expect(() => resolveStorageBackend()).toThrow('Invalid AUTH0_TV_STORAGE value "invalid"');
  });
});

// ── loadConfigFromEnv ─────────────────────────────────────────

describe('loadConfigFromEnv', () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  function setEnv(vars: Record<string, string | undefined>) {
    for (const [key, val] of Object.entries(vars)) {
      saved[key] = process.env[key];
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  }

  it('returns config when all required env vars set', () => {
    setEnv({
      AUTH0_DOMAIN: 'test.auth0.com',
      AUTH0_CLIENT_ID: 'cid',
      AUTH0_CLIENT_SECRET: 'csec',
      AUTH0_AUDIENCE: 'https://api.example.com',
    });

    const config = loadConfigFromEnv();
    expect(config).toEqual({
      domain: 'test.auth0.com',
      clientId: 'cid',
      clientSecret: 'csec',
      audience: 'https://api.example.com',
    });
  });

  it('returns null when any required env var missing', () => {
    setEnv({
      AUTH0_DOMAIN: 'test.auth0.com',
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: 'csec',
    });

    expect(loadConfigFromEnv()).toBeNull();
  });

  it('audience is optional', () => {
    setEnv({
      AUTH0_DOMAIN: 'test.auth0.com',
      AUTH0_CLIENT_ID: 'cid',
      AUTH0_CLIENT_SECRET: 'csec',
      AUTH0_AUDIENCE: undefined,
    });

    const config = loadConfigFromEnv();
    expect(config).not.toBeNull();
    expect(config?.audience).toBeUndefined();
  });
});

// ── loadConfigFromStore ───────────────────────────────────────

describe('loadConfigFromStore', () => {
  let tempDir: string;
  let store: CredentialStore;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  async function makeStore() {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-cfg-'));
    store = new CredentialStore(tempDir);
    return store;
  }

  it('returns config from store', async () => {
    const s = await makeStore();
    await s.saveConfig({
      domain: 'test.auth0.com',
      clientId: 'cid',
      clientSecret: 'csec',
      audience: 'https://api.example.com',
    });

    const config = await loadConfigFromStore(s);
    expect(config).toEqual({
      domain: 'test.auth0.com',
      clientId: 'cid',
      clientSecret: 'csec',
      audience: 'https://api.example.com',
    });
  });

  it('returns null when store has no config', async () => {
    const s = await makeStore();
    expect(await loadConfigFromStore(s)).toBeNull();
  });
});

// ── requireConfig ─────────────────────────────────────────────

describe('requireConfig', () => {
  const saved: Record<string, string | undefined> = {};
  let tempDir: string;

  afterEach(async () => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  function setEnv(vars: Record<string, string | undefined>) {
    for (const [key, val] of Object.entries(vars)) {
      saved[key] = process.env[key];
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  }

  async function makeStore() {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-cfg-'));
    return new CredentialStore(tempDir);
  }

  it('prefers env vars over store', async () => {
    setEnv({
      AUTH0_DOMAIN: 'env.auth0.com',
      AUTH0_CLIENT_ID: 'env-cid',
      AUTH0_CLIENT_SECRET: 'env-csec',
    });
    const store = await makeStore();
    await store.saveConfig({
      domain: 'store.auth0.com',
      clientId: 'store-cid',
      clientSecret: 'store-csec',
    });

    const config = await requireConfig(store);
    expect(config.domain).toBe('env.auth0.com');
  });

  it('falls back to store when env vars missing', async () => {
    setEnv({
      AUTH0_DOMAIN: undefined,
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
    });
    const store = await makeStore();
    await store.saveConfig({
      domain: 'store.auth0.com',
      clientId: 'store-cid',
      clientSecret: 'store-csec',
    });

    const config = await requireConfig(store);
    expect(config.domain).toBe('store.auth0.com');
  });

  it('throws when neither env vars nor store config available', async () => {
    setEnv({
      AUTH0_DOMAIN: undefined,
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
    });
    const store = await makeStore();

    await expect(requireConfig(store)).rejects.toThrow('Not configured');
  });
});
