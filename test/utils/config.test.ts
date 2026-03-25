import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveStorageBackend } from '../../src/utils/config.js';

describe('resolveStorageBackend', () => {
  const originalEnv = process.env.AUTH0_TV_STORAGE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AUTH0_TV_STORAGE;
    } else {
      process.env.AUTH0_TV_STORAGE = originalEnv;
    }
  });

  it('defaults to keyring when no config or env', () => {
    delete process.env.AUTH0_TV_STORAGE;
    expect(resolveStorageBackend()).toBe('keyring');
  });

  it('uses config value when no env var', () => {
    delete process.env.AUTH0_TV_STORAGE;
    expect(resolveStorageBackend('file')).toBe('file');
  });

  it('env var takes precedence over config', () => {
    process.env.AUTH0_TV_STORAGE = 'file';
    expect(resolveStorageBackend('keyring')).toBe('file');
  });

  it('env var keyring overrides config file', () => {
    process.env.AUTH0_TV_STORAGE = 'keyring';
    expect(resolveStorageBackend('file')).toBe('keyring');
  });

  it('throws on invalid env var value', () => {
    process.env.AUTH0_TV_STORAGE = 'invalid';
    expect(() => resolveStorageBackend()).toThrow('Invalid AUTH0_TV_STORAGE value "invalid"');
  });
});
