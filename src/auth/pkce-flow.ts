import { createServer } from 'node:http';
import * as client from 'openid-client';
import open from 'open';
import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';
import { bindServer, htmlPage } from './browser.js';
import { getOidcConfig } from './oidc-config.js';

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
  /** Browser app name to use (e.g. 'firefox'). Undefined = system default. */
  browser?: string;
  /** Specific port for the local callback server. If omitted, auto-selects from 18484-18489. */
  port?: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

const SUCCESS_HTML = htmlPage(
  'Authentication successful',
  'You can close this tab and return to the terminal.'
);
const ERROR_HTML = (msg: string) => htmlPage('Authentication failed', msg);

/**
 * Run a full Authorization Code + PKCE flow:
 * 1. Start local callback server
 * 2. Open browser to Auth0 /authorize
 * 3. Wait for callback with authorization code
 * 4. Exchange code for tokens via openid-client
 */
export async function runPkceFlow(options: PkceFlowOptions): Promise<TokenResponse> {
  const { config, connection, connectionScope, extraParams, scope, browser, port } = options;

  const oidcConfig = await getOidcConfig(config);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  return new Promise<TokenResponse>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const shutdown = () => {
      server.close();
      server.closeAllConnections();
    };

    const server = createServer(async (req, res) => {
      const addr = server.address();
      if (!addr) {
        res.writeHead(503).end();
        return;
      }
      const port = (addr as { port: number }).port;
      const callbackUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

      if (callbackUrl.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }

      try {
        const tokens = await client.authorizationCodeGrant(oidcConfig, callbackUrl, {
          pkceCodeVerifier: codeVerifier,
          expectedState: state,
        });

        res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_HTML);
        shutdown();
        settle(() =>
          resolve({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            id_token: tokens.id_token,
            expires_in: tokens.expires_in ?? 86400,
            token_type: tokens.token_type,
            scope: tokens.scope,
          })
        );
      } catch (err) {
        const message =
          err instanceof client.AuthorizationResponseError
            ? (err.error_description ?? err.error)
            : err instanceof Error
              ? err.message
              : 'Token exchange failed';
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML(message));
        shutdown();
        settle(() => reject(err instanceof Error ? err : new Error(String(message))));
      }
    });

    const timeout = setTimeout(() => {
      shutdown();
      settle(() => reject(new Error('Authentication timed out (2 minutes)')));
    }, TIMEOUT_MS);

    server.on('close', () => clearTimeout(timeout));

    // Start server and open browser
    bindServer(server, port !== undefined ? [port] : undefined)
      .then((port) => {
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        log('redirect server listening on http://127.0.0.1:%d', port);
        process.stderr.write(
          `Redirect server listening on http://127.0.0.1:${port}\nOpening browser for authorization...\n`
        );

        const params: Record<string, string> = {
          redirect_uri: redirectUri,
          scope: scope ?? 'openid profile email offline_access',
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          state,
        };

        if (config.audience) params.audience = config.audience;
        if (connection) params.connection = connection;
        if (connectionScope) params.connection_scope = connectionScope;
        if (extraParams) Object.assign(params, extraParams);

        const authorizeUrl = client.buildAuthorizationUrl(oidcConfig, params);
        log('opening browser to %s', authorizeUrl.href);

        return open(authorizeUrl.href, browser ? { app: { name: browser } } : undefined);
      })
      .catch((err) => {
        shutdown();
        settle(() => reject(err));
      });
  });
}
