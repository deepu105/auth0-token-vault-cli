import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import open from 'open';
import { log, logError } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';

const CALLBACK_PORTS = [18484, 18485, 18486, 18487, 18488, 18489];
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export interface PkceFlowOptions {
  config: Auth0Config;
  /** Auth0 connection to force (e.g. "google-oauth2" for connect flow) */
  connection?: string;
  /** Connection-level scopes (e.g. Gmail scopes) */
  connectionScope?: string;
  /** Additional authorize params */
  extraParams?: Record<string, string>;
  /** Base scopes for the Auth0 request */
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/** Generate PKCE code_verifier and code_challenge */
function generatePkce() {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/** Try to bind a server to the first available port in the range */
async function bindServer(server: Server): Promise<number> {
  for (const port of CALLBACK_PORTS) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      return port;
    } catch {
      log('port %d unavailable, trying next', port);
    }
  }
  throw new Error(
    `Could not bind callback server to any port in range ${CALLBACK_PORTS[0]}-${CALLBACK_PORTS[CALLBACK_PORTS.length - 1]}`
  );
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Auth0 Token Vault CLI</title></head>
<body style="font-family:system-ui;text-align:center;padding:2em">
<h2>Authentication successful</h2>
<p>You can close this tab and return to the terminal.</p>
<script>window.close()</script>
</body></html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html><head><title>Auth0 Token Vault CLI</title></head>
<body style="font-family:system-ui;text-align:center;padding:2em">
<h2>Authentication failed</h2>
<p>${msg}</p>
</body></html>`;

/**
 * Run a full Authorization Code + PKCE flow:
 * 1. Start local callback server
 * 2. Open browser to Auth0 /authorize
 * 3. Wait for callback with authorization code
 * 4. Exchange code for tokens
 */
export async function runPkceFlow(options: PkceFlowOptions): Promise<TokenResponse> {
  const { config, connection, connectionScope, extraParams, scope } = options;
  const { codeVerifier, codeChallenge } = generatePkce();
  const state = randomBytes(16).toString('base64url');

  return new Promise<TokenResponse>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`);

      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        const desc = url.searchParams.get('error_description') ?? error;
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML(desc));
        server.close();
        settle(() => reject(new Error(`Auth0 error: ${desc}`)));
        return;
      }

      const returnedState = url.searchParams.get('state');
      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML('State mismatch'));
        server.close();
        settle(() => reject(new Error('PKCE state mismatch — possible CSRF')));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML('Missing code'));
        server.close();
        settle(() => reject(new Error('Missing authorization code')));
        return;
      }

      // Exchange code for tokens
      try {
        const port = (server.address() as { port: number }).port;
        const tokens = await exchangeCode(config, code, codeVerifier, port);
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_HTML);
        server.close();
        settle(() => resolve(tokens));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' }).end(ERROR_HTML('Token exchange failed'));
        server.close();
        settle(() => reject(err));
      }
    });

    const timeout = setTimeout(() => {
      server.close();
      settle(() => reject(new Error('Authentication timed out (2 minutes)')));
    }, TIMEOUT_MS);

    server.on('close', () => clearTimeout(timeout));

    // Start server and open browser
    bindServer(server)
      .then((port) => {
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: config.clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          scope: scope ?? 'openid profile email offline_access',
        });

        if (config.audience) {
          params.set('audience', config.audience);
        }
        if (connection) {
          params.set('connection', connection);
        }
        if (connectionScope) {
          params.set('connection_scope', connectionScope);
        }
        if (extraParams) {
          for (const [k, v] of Object.entries(extraParams)) {
            params.set(k, v);
          }
        }

        const authorizeUrl = `https://${config.domain}/authorize?${params.toString()}`;
        log('opening browser to %s', authorizeUrl);

        return open(authorizeUrl);
      })
      .catch((err) => {
        server.close();
        settle(() => reject(err));
      });
  });
}

/** Exchange authorization code for tokens at Auth0's /oauth/token endpoint */
async function exchangeCode(
  config: Auth0Config,
  code: string,
  codeVerifier: string,
  port: number
): Promise<TokenResponse> {
  const body = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: `http://127.0.0.1:${port}/callback`,
  };

  const res = await fetch(`https://${config.domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    log('token exchange failed: %s %s', res.status, errBody);
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  return (await res.json()) as TokenResponse;
}
