import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers.js';
import { getOidcConfig, clearOidcConfigCache } from '../../src/auth/oidc-config.js';
import type { Auth0Config } from '../../src/utils/config.js';

const config: Auth0Config = {
  domain: 'test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('getOidcConfig', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('returns a Configuration via OIDC discovery', async () => {
    const oidcConfig = await getOidcConfig(config);
    expect(oidcConfig).toBeDefined();
    const metadata = oidcConfig.serverMetadata();
    expect(metadata.issuer).toBe('https://test.auth0.com/');
    expect(metadata.token_endpoint).toBe('https://test.auth0.com/oauth/token');
  });

  it('caches config for the same domain', async () => {
    const first = await getOidcConfig(config);
    const second = await getOidcConfig(config);
    expect(first).toBe(second);
  });
});
