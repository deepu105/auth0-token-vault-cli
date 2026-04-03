import { describe, it, expect } from 'vitest';
import {
  getServiceEntry,
  getConnectionForService,
  getScopesForService,
  getAllowedDomainsForService,
  getServiceForConnection,
  getServicesForConnection,
  getAvailableServices,
  resolveService,
} from '../../src/utils/service-registry.js';

describe('service-registry', () => {
  it('getServiceEntry returns entry for known service', () => {
    const entry = getServiceEntry('gmail');
    expect(entry).toBeDefined();
    expect(entry!.connection).toBe('google-oauth2');
    expect(entry!.scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
  });

  it('getServiceEntry returns calendar entry', () => {
    const entry = getServiceEntry('calendar');
    expect(entry).toBeDefined();
    expect(entry!.connection).toBe('google-oauth2');
    expect(entry!.scopes).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(entry!.scopes).toContain('https://www.googleapis.com/auth/calendar.events');
  });

  it('getServiceEntry returns slack entry', () => {
    const entry = getServiceEntry('slack');
    expect(entry).toBeDefined();
    expect(entry!.connection).toBe('sign-in-with-slack');
    expect(entry!.scopes).toContain('chat:write');
    expect(entry!.scopes).toContain('search:read.public');
  });

  it('getServiceEntry returns github entry', () => {
    const entry = getServiceEntry('github');
    expect(entry).toBeDefined();
    expect(entry!.connection).toBe('github');
    expect(entry!.scopes).toEqual([]);
  });

  it('entries have default allowedDomains', () => {
    expect(getServiceEntry('gmail')!.allowedDomains).toEqual(['*.googleapis.com']);
    expect(getServiceEntry('calendar')!.allowedDomains).toEqual(['*.googleapis.com']);
    expect(getServiceEntry('github')!.allowedDomains).toEqual(['api.github.com']);
    expect(getServiceEntry('slack')!.allowedDomains).toEqual(['slack.com', '*.slack.com']);
  });

  it('getServiceEntry is case-insensitive', () => {
    expect(getServiceEntry('Gmail')).toBeDefined();
    expect(getServiceEntry('GMAIL')).toBeDefined();
    expect(getServiceEntry('Calendar')).toBeDefined();
    expect(getServiceEntry('Slack')).toBeDefined();
    expect(getServiceEntry('GitHub')).toBeDefined();
  });

  it('getServiceEntry returns undefined for unknown service', () => {
    expect(getServiceEntry('unknown')).toBeUndefined();
  });

  it('getConnectionForService returns connection identifier', () => {
    expect(getConnectionForService('gmail')).toBe('google-oauth2');
    expect(getConnectionForService('calendar')).toBe('google-oauth2');
    expect(getConnectionForService('slack')).toBe('sign-in-with-slack');
    expect(getConnectionForService('github')).toBe('github');
  });

  it('getConnectionForService returns undefined for unknown service', () => {
    expect(getConnectionForService('unknown')).toBeUndefined();
  });

  it('getScopesForService returns scopes array', () => {
    const scopes = getScopesForService('gmail');
    expect(scopes).toBeDefined();
    expect(scopes!.length).toBeGreaterThan(0);
  });

  it('getServiceForConnection returns first service name', () => {
    expect(getServiceForConnection('google-oauth2')).toBe('gmail');
    expect(getServiceForConnection('sign-in-with-slack')).toBe('slack');
  });

  it('getServiceForConnection returns undefined for unknown connection', () => {
    expect(getServiceForConnection('unknown-connection')).toBeUndefined();
  });

  it('getServicesForConnection returns all services for shared connection', () => {
    const services = getServicesForConnection('google-oauth2');
    expect(services).toContain('gmail');
    expect(services).toContain('calendar');
    expect(services).toHaveLength(2);
  });

  it('getServicesForConnection returns single service', () => {
    expect(getServicesForConnection('sign-in-with-slack')).toEqual(['slack']);
    expect(getServicesForConnection('github')).toEqual(['github']);
  });

  it('getServicesForConnection returns empty for unknown connection', () => {
    expect(getServicesForConnection('unknown')).toEqual([]);
  });

  it('getAvailableServices returns all service names', () => {
    const services = getAvailableServices();
    expect(services).toContain('gmail');
    expect(services).toContain('calendar');
    expect(services).toContain('slack');
    expect(services).toContain('github');
    expect(services).toHaveLength(4);
  });

  it('getAllowedDomainsForService returns domains for known service', () => {
    expect(getAllowedDomainsForService('github')).toEqual(['api.github.com']);
    expect(getAllowedDomainsForService('Gmail')).toEqual(['*.googleapis.com']);
  });

  it('getAllowedDomainsForService returns undefined for unknown service', () => {
    expect(getAllowedDomainsForService('unknown')).toBeUndefined();
  });

  describe('resolveService', () => {
    it('returns known entry with isKnown true for gmail', () => {
      const resolved = resolveService('gmail');
      expect(resolved.isKnown).toBe(true);
      expect(resolved.connection).toBe('google-oauth2');
      expect(resolved.scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
      expect(resolved.allowedDomains).toEqual(['*.googleapis.com']);
    });

    it('returns known entry for all registered services', () => {
      for (const service of ['gmail', 'calendar', 'github', 'slack']) {
        const resolved = resolveService(service);
        expect(resolved.isKnown).toBe(true);
        expect(resolved.connection).toBeTruthy();
      }
    });

    it('is case-insensitive for known services', () => {
      expect(resolveService('Gmail').isKnown).toBe(true);
      expect(resolveService('GMAIL').isKnown).toBe(true);
      expect(resolveService('Slack').isKnown).toBe(true);
    });

    it('returns unknown entry with input as connection for unrecognized service', () => {
      const resolved = resolveService('my-custom-idp');
      expect(resolved.isKnown).toBe(false);
      expect(resolved.connection).toBe('my-custom-idp');
      expect(resolved.scopes).toEqual([]);
      expect(resolved.allowedDomains).toEqual([]);
    });

    it('lowercases connection name for unknown services', () => {
      const resolved = resolveService('My-Custom-IDP');
      expect(resolved.isKnown).toBe(false);
      expect(resolved.connection).toBe('my-custom-idp');
    });

    it('handles Auth0 connection identifiers as unknown services', () => {
      const resolved = resolveService('google-oauth2');
      // google-oauth2 is not a known service name (gmail/calendar are), so it's unknown
      expect(resolved.isKnown).toBe(false);
      expect(resolved.connection).toBe('google-oauth2');
    });

    it('handles sign-in-with-slack as unknown (not a known service name)', () => {
      // sign-in-with-slack is a connection name, not a service name
      const resolved = resolveService('sign-in-with-slack');
      expect(resolved.isKnown).toBe(false);
      expect(resolved.connection).toBe('sign-in-with-slack');
    });
  });
});
