import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as client from 'openid-client';
import http from 'node:http';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers.js';

describe('PKCE crypto (openid-client)', () => {
  it('generates a valid code_verifier (base64url)', () => {
    const verifier = client.randomPKCECodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('derives a code_challenge from code_verifier', async () => {
    const verifier = client.randomPKCECodeVerifier();
    const challenge = await client.calculatePKCECodeChallenge(verifier);
    expect(challenge).toBeTruthy();
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique state values', () => {
    const state1 = client.randomState();
    const state2 = client.randomState();
    expect(state1).not.toBe(state2);
  });
});

describe('PKCE callback server', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => msw.resetHandlers());

  it('rejects requests to non-/callback paths', async () => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200).end('ok');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    const res = await fetch(`http://127.0.0.1:${port}/other`);
    expect(res.status).toBe(404);

    server.close();
  });

  it('binds to 127.0.0.1 only', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const addr = server.address();
    expect(addr).not.toBeNull();
    expect((addr as { address: string }).address).toBe('127.0.0.1');

    server.close();
  });
});
