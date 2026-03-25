import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeConfigFromEnvAndStore, requireConfig, resolveStorageBackend } from '../../src/utils/config.js';
import { CredentialStore } from '../../src/store/credential-store.js';

// ── resolveStorageBackend ─────────────────────────────────────

describe('resolveStorageBackend', () => {
  const originalEnv = process.env.AUTH0_TV_STORAGE;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AUTH0_TV_STORAGE;
    else process.env.AUTH0_TV_STORAGE = originalEnv;
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

// ── mergeConfigFromEnvAndStore ────────────────────────────────

describe('mergeConfigFromEnvAndStore', () => {
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

  it('resolves all fields from env vars', () => {
    setEnv({
      AUTH0_DOMAIN: 'env.auth0.com',
      AUTH0_CLIENT_ID: 'env-cid',
      AUTH0_CLIENT_SECRET: 'env-csec',
      AUTH0_AUDIENCE: 'https://api.example.com',
    });

    const result = mergeConfigFromEnvAndStore(null);
    expect(result.missing).toEqual([]);
    expect(result.domain).toBe('env.auth0.com');
    expect(result.audience).toBe('https://api.example.com');
  });

  it('resolves all fields from stored config', () => {
    setEnv({
      AUTH0_DOMAIN: undefined,
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
    });

    const result = mergeConfigFromEnvAndStore({
      domain: 'store.auth0.com',
      clientId: 'store-cid',
      clientSecret: 'store-csec',
    });
    expect(result.missing).toEqual([]);
    expect(result.domain).toBe('store.auth0.com');
  });

  it('env var takes precedence over stored value per field', () => {
    setEnv({
      AUTH0_DOMAIN: 'env.auth0.com',
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
    });

    const result = mergeConfigFromEnvAndStore({
      domain: 'store.auth0.com',
      clientId: 'store-cid',
      clientSecret: 'store-csec',
    });
    expect(result.missing).toEqual([]);
    expect(result.domain).toBe('env.auth0.com');
    expect(result.clientId).toBe('store-cid');
  });

  it('reports missing fields', () => {
    setEnv({
      AUTH0_DOMAIN: undefined,
      AUTH0_CLIENT_ID: 'cid',
      AUTH0_CLIENT_SECRET: undefined,
    });

    const result = mergeConfigFromEnvAndStore(null);
    expect(result.missing).toEqual(['AUTH0_DOMAIN', 'AUTH0_CLIENT_SECRET']);
  });

  it('audience is optional and never reported missing', () => {
    setEnv({
      AUTH0_DOMAIN: 'x',
      AUTH0_CLIENT_ID: 'y',
      AUTH0_CLIENT_SECRET: 'z',
      AUTH0_AUDIENCE: undefined,
    });

    const result = mergeConfigFromEnvAndStore(null);
    expect(result.missing).toEqual([]);
    expect(result.audience).toBeUndefined();
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

  it('mixes env vars and store per field', async () => {
    setEnv({
      AUTH0_DOMAIN: 'env.auth0.com',
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
    expect(config.domain).toBe('env.auth0.com');
    expect(config.clientId).toBe('store-cid');
  });

  it('throws with specific missing fields', async () => {
    setEnv({
      AUTH0_DOMAIN: undefined,
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
    });
    const store = await makeStore();

    await expect(requireConfig(store)).rejects.toThrow('AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET');
  });
});
