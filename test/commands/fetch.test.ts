import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDomainAllowed } from '../../src/commands/fetch.js';
import { resolveService } from '../../src/utils/service-registry.js';

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

describe('fetch with custom services', () => {
  it('known service has default allowed domains', () => {
    const resolved = resolveService('gmail');
    expect(resolved.allowedDomains).toEqual(['*.googleapis.com']);
  });

  it('custom service has empty default allowed domains', () => {
    const resolved = resolveService('my-custom-idp');
    expect(resolved.allowedDomains).toEqual([]);
  });

  it('custom service with stored domains allows matching requests', () => {
    // Simulates the domain check after loading stored settings
    const storedDomains = ['api.example.com', '*.example.org'];
    const resolved = resolveService('my-custom-idp');
    const allowedDomains =
      storedDomains.length > 0
        ? [...new Set([...storedDomains, ...resolved.allowedDomains])]
        : resolved.allowedDomains;

    const url = new URL('https://api.example.com/data');
    expect(isDomainAllowed(url, allowedDomains)).toBe(true);

    const wildcardUrl = new URL('https://sub.example.org/data');
    expect(isDomainAllowed(wildcardUrl, allowedDomains)).toBe(true);

    const blockedUrl = new URL('https://evil.com/steal');
    expect(isDomainAllowed(blockedUrl, allowedDomains)).toBe(false);
  });

  it('custom service with no stored domains has empty allowed list', () => {
    const resolved = resolveService('my-custom-idp');
    const storedDomains: string[] = [];
    const allowedDomains =
      storedDomains.length > 0
        ? [...new Set([...storedDomains, ...resolved.allowedDomains])]
        : resolved.allowedDomains;

    expect(allowedDomains).toEqual([]);
  });
});
