import { describe, it, expect } from 'vitest';
import { parseClientId, parseSingleTenant, parseAppSecret } from '../../src/commands/init.js';

describe('init: parseClientId', () => {
  it('parses client ID from configure output', () => {
    const out = 'Configuring...\nYour application Client ID: abc123\nDone.\n';
    expect(parseClientId(out)).toBe('abc123');
  });

  it('parses with extra whitespace', () => {
    expect(parseClientId('Client ID:   my-id-456')).toBe('my-id-456');
  });

  it('is case-insensitive', () => {
    expect(parseClientId('client id: XYZ')).toBe('XYZ');
  });

  it('returns undefined when no match', () => {
    expect(parseClientId('No client info here')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseClientId('')).toBeUndefined();
  });

  it('strips ANSI escape codes from PTY output', () => {
    const out = 'Client ID: \x1b[2mP8OfyRUnCkBXDTquR4SOK5VtDtRpoj72\x1b[22m\x1b[2m\x1b[22m';
    expect(parseClientId(out)).toBe('P8OfyRUnCkBXDTquR4SOK5VtDtRpoj72');
  });
});

describe('init: parseSingleTenant', () => {
  it('returns domain for single tenant', () => {
    const json = JSON.stringify([{ name: 'my-tenant.auth0.com' }]);
    expect(parseSingleTenant(json)).toBe('my-tenant.auth0.com');
  });

  it('uses domain field when name is absent', () => {
    const json = JSON.stringify([{ domain: 'my-tenant.eu.auth0.com' }]);
    expect(parseSingleTenant(json)).toBe('my-tenant.eu.auth0.com');
  });

  it('prefers name over domain', () => {
    const json = JSON.stringify([{ name: 'a.auth0.com', domain: 'b.auth0.com' }]);
    expect(parseSingleTenant(json)).toBe('a.auth0.com');
  });

  it('returns undefined for empty array', () => {
    expect(parseSingleTenant('[]')).toBeUndefined();
  });

  it('returns undefined for multiple tenants', () => {
    const json = JSON.stringify([{ name: 'a.auth0.com' }, { name: 'b.auth0.com' }]);
    expect(parseSingleTenant(json)).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseSingleTenant('not json')).toBeUndefined();
  });

  it('returns undefined for non-array', () => {
    expect(parseSingleTenant('{"name": "x"}')).toBeUndefined();
  });
});

describe('init: parseAppSecret', () => {
  it('parses client_secret (snake_case)', () => {
    const json = JSON.stringify({ client_id: 'abc', client_secret: 'super-secret' });
    expect(parseAppSecret(json)).toBe('super-secret');
  });

  it('parses clientSecret (camelCase)', () => {
    const json = JSON.stringify({ clientId: 'abc', clientSecret: 'camel-secret' });
    expect(parseAppSecret(json)).toBe('camel-secret');
  });

  it('returns undefined when secret is missing', () => {
    const json = JSON.stringify({ client_id: 'abc', name: 'My App' });
    expect(parseAppSecret(json)).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseAppSecret('not json')).toBeUndefined();
  });

  it('returns undefined for null value', () => {
    const json = JSON.stringify({ client_secret: null });
    expect(parseAppSecret(json)).toBeUndefined();
  });
});
