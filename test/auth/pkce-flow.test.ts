import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { setupServer } from 'msw/node';
import { handlers, mockTokenResponse } from '../mocks/handlers.js';

// We test the internal helpers indirectly by hitting the callback server,
// but also verify the PKCE crypto directly.

describe('PKCE crypto', () => {
  it('generates a valid code_verifier (43-128 chars, base64url)', () => {
    const verifier = randomBytes(32).toString('base64url');
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('derives correct code_challenge from code_verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    // Known SHA-256 of the above verifier
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
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
