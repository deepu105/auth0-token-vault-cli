import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDomainAllowed } from '../../src/commands/fetch.js';

describe('isDomainAllowed', () => {
  it('allows exact domain match', () => {
    const url = new URL('https://api.github.com/user');
    expect(isDomainAllowed(url, ['api.github.com'])).toBe(true);
  });

  it('rejects non-matching domain', () => {
    const url = new URL('https://evil.com/steal');
    expect(isDomainAllowed(url, ['api.github.com'])).toBe(false);
  });

  it('is case-insensitive', () => {
    const url = new URL('https://API.GitHub.Com/user');
    expect(isDomainAllowed(url, ['api.github.com'])).toBe(true);
  });

  it('supports wildcard subdomains', () => {
    const url = new URL('https://mail.googleapis.com/gmail/v1/users/me');
    expect(isDomainAllowed(url, ['*.googleapis.com'])).toBe(true);
  });

  it('wildcard does not match the root domain itself', () => {
    const url = new URL('https://googleapis.com/something');
    expect(isDomainAllowed(url, ['*.googleapis.com'])).toBe(false);
  });

  it('wildcard matches deeply nested subdomains', () => {
    const url = new URL('https://a.b.c.googleapis.com/data');
    expect(isDomainAllowed(url, ['*.googleapis.com'])).toBe(true);
  });

  it('rejects when allowed list is empty', () => {
    const url = new URL('https://api.github.com/user');
    expect(isDomainAllowed(url, [])).toBe(false);
  });

  it('checks multiple allowed domains', () => {
    const url = new URL('https://api.slack.com/conversations.list');
    expect(isDomainAllowed(url, ['api.github.com', 'api.slack.com'])).toBe(true);
  });

  it('rejects partial domain matches', () => {
    const url = new URL('https://notapi.github.com/user');
    expect(isDomainAllowed(url, ['api.github.com'])).toBe(false);
  });

  it('rejects when domain is a suffix of an allowed domain', () => {
    const url = new URL('https://github.com/user');
    expect(isDomainAllowed(url, ['api.github.com'])).toBe(false);
  });
});
