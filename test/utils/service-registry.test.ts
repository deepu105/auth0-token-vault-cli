import { describe, it, expect } from 'vitest';
import {
  getServiceEntry,
  getConnectionForService,
  getScopesForService,
  getServiceForConnection,
  getAvailableServices,
} from '../../src/utils/service-registry.js';

describe('service-registry', () => {
  it('getServiceEntry returns entry for known service', () => {
    const entry = getServiceEntry('gmail');
    expect(entry).toBeDefined();
    expect(entry!.connection).toBe('google-oauth2');
    expect(entry!.scopes).toContain('https://www.googleapis.com/auth/gmail.modify');
  });

  it('getServiceEntry is case-insensitive', () => {
    expect(getServiceEntry('Gmail')).toBeDefined();
    expect(getServiceEntry('GMAIL')).toBeDefined();
  });

  it('getServiceEntry returns undefined for unknown service', () => {
    expect(getServiceEntry('unknown')).toBeUndefined();
  });

  it('getConnectionForService returns connection identifier', () => {
    expect(getConnectionForService('gmail')).toBe('google-oauth2');
  });

  it('getConnectionForService returns undefined for unknown service', () => {
    expect(getConnectionForService('unknown')).toBeUndefined();
  });

  it('getScopesForService returns scopes array', () => {
    const scopes = getScopesForService('gmail');
    expect(scopes).toBeDefined();
    expect(scopes!.length).toBeGreaterThan(0);
  });

  it('getServiceForConnection returns service name', () => {
    expect(getServiceForConnection('google-oauth2')).toBe('gmail');
  });

  it('getServiceForConnection returns undefined for unknown connection', () => {
    expect(getServiceForConnection('unknown-connection')).toBeUndefined();
  });

  it('getAvailableServices returns all service names', () => {
    const services = getAvailableServices();
    expect(services).toContain('gmail');
    expect(services.length).toBeGreaterThan(0);
  });
});
