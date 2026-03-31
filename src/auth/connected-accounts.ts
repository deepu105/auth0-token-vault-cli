import { createServer } from 'node:http';
import * as client from 'openid-client';
import open from 'open';
import { log } from '../utils/logger.js';
import type { Auth0Config } from '../utils/config.js';
import { bindServer, htmlPage } from './browser.js';
import { getOidcConfig, HTTP_TIMEOUT_MS } from './oidc-config.js';

const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

const MY_ACCOUNT_SCOPES =
  'create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts';

const SUCCESS_HTML = htmlPage(
  'Account connected',
  'You can close this tab and return to the terminal.'
);
const ERROR_HTML = (msg: string) => htmlPage('Connection failed', msg);

interface ConnectInitResponse {
  auth_session: string;
  connect_uri: string;
  connect_params: { ticket: string };
  expires_in: number;
}

interface ConnectCompleteResponse {
  id: string;
  connection: string;
  scopes: string[];
  access_type: string;
  created_at: string;
}

/**
 * Check a fetch Response and throw with a descriptive message if not OK.
 */
async function throwOnHttpError(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errDesc = (errBody as Record<string, string>).message ?? `HTTP ${res.status}`;
    throw new Error(`${context}: ${errDesc}`);
  }
}

/**
 * Get a My Account API access token by exchanging the user's refresh token
 * with the MRRT (Multi-Resource Refresh Token) audience.
 * Uses openid-client's refreshTokenGrant with additional audience/scope parameters.
 */
async function getMyAccountToken(config: Auth0Config, refreshToken: string): Promise<string> {
  const audience = `https://${config.domain}/me/`;

  log('requesting my account api token with audience %s', audience);

  const oidcConfig = await getOidcConfig(config);
  const tokens = await client.refreshTokenGrant(oidcConfig, refreshToken, {
    audience,
    scope: MY_ACCOUNT_SCOPES,
  });

  return tokens.access_token;
}

/**
 * Initiate a Connected Account link via the My Account API.
 * Returns the connect_uri to redirect the user to and the auth_session for completion.
 */
async function initiateConnect(
  config: Auth0Config,
  myAccountToken: string,
  connection: string,
  scopes: string[],
  redirectUri: string,
  state: string
): Promise<ConnectInitResponse> {
  log('initiating connected account for %s', connection);

  const res = await fetch(`https://${config.domain}/me/v1/connected-accounts/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${myAccountToken}`,
    },
    body: JSON.stringify({
      connection,
      redirect_uri: redirectUri,
      state,
      // Only include scopes when non-empty — the API rejects an empty array
      ...(scopes.length > 0 ? { scopes } : {}),
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  await throwOnHttpError(res, 'Failed to initiate connected account');

  return (await res.json()) as ConnectInitResponse;
}

/**
 * Complete a Connected Account link after the user has authorized.
 */
async function completeConnect(
  config: Auth0Config,
  myAccountToken: string,
  authSession: string,
  connectCode: string,
  redirectUri: string
): Promise<ConnectCompleteResponse> {
  log('completing connected account link');

  const res = await fetch(`https://${config.domain}/me/v1/connected-accounts/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${myAccountToken}`,
    },
    body: JSON.stringify({
      auth_session: authSession,
      connect_code: connectCode,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  await throwOnHttpError(res, 'Failed to complete connected account');

  return (await res.json()) as ConnectCompleteResponse;
}

export interface ConnectedAccountResult {
  id: string;
  connection: string;
  scopes: string[];
}

/**
 * Run the full Connected Accounts flow:
 * 1. Get a My Account API token (MRRT)
 * 2. Initiate connect via /me/v1/connected-accounts/connect
 * 3. Open browser to connect_uri for user authorization
 * 4. Wait for callback with connect_code
 * 5. Complete via /me/v1/connected-accounts/complete
 */
export async function runConnectedAccountFlow(options: {
  config: Auth0Config;
  refreshToken: string;
  connection: string;
  scopes: string[];
  browser?: string;
  /** Specific port for the local callback server. If omitted, auto-selects from 18484-18489. */
  port?: number;
}): Promise<ConnectedAccountResult> {
  const { config, refreshToken, connection, scopes, browser, port } = options;

  // Step 1: Get My Account API token
  const myAccountToken = await getMyAccountToken(config, refreshToken);

  // Step 2 & 3: Start callback server, initiate connect, open browser
  const state = client.randomState();

  return new Promise<ConnectedAccountResult>((resolve, reject) => {
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

      const error = callbackUrl.searchParams.get('error');
      if (error) {
        const desc = callbackUrl.searchParams.get('error_description') ?? error;
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML(desc));
        shutdown();
        settle(() => reject(new Error(`Authorization error: ${desc}`)));
        return;
      }

      const returnedState = callbackUrl.searchParams.get('state');
      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML('State mismatch'));
        shutdown();
        settle(() => reject(new Error('State mismatch — possible CSRF')));
        return;
      }

      // Auth0 returns the single-use code as `connect_code` (or `code` as fallback)
      const connectCode =
        callbackUrl.searchParams.get('connect_code') ?? callbackUrl.searchParams.get('code');
      if (!connectCode) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(ERROR_HTML('Missing connect_code'));
        shutdown();
        settle(() => reject(new Error('Missing connect_code in callback')));
        return;
      }

      // Step 5: Complete the connected account link
      try {
        const authSession = await authSessionPromise;
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        const result = await completeConnect(
          config,
          myAccountToken,
          authSession,
          connectCode,
          redirectUri
        );

        res.writeHead(200, { 'Content-Type': 'text/html' }).end(SUCCESS_HTML);
        shutdown();
        settle(() =>
          resolve({
            id: result.id,
            connection: result.connection,
            scopes: result.scopes,
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Complete failed';
        res.writeHead(500, { 'Content-Type': 'text/html' }).end(ERROR_HTML(message));
        shutdown();
        settle(() => reject(err instanceof Error ? err : new Error(String(message))));
      }
    });

    const timeout = setTimeout(() => {
      shutdown();
      settle(() => reject(new Error('Authorization timed out (2 minutes)')));
    }, TIMEOUT_MS);

    server.on('close', () => clearTimeout(timeout));

    // Deferred promise so the callback handler can safely await authSession
    // even if the callback fires before initiateConnect resolves.
    let resolveAuthSession!: (value: string) => void;
    const authSessionPromise = new Promise<string>((r) => {
      resolveAuthSession = r;
    });

    bindServer(server, port !== undefined ? [port] : undefined)
      .then(async (port) => {
        const redirectUri = `http://127.0.0.1:${port}/callback`;
        log('redirect server listening on http://127.0.0.1:%d', port);
        process.stderr.write(`Redirect server listening on http://127.0.0.1:${port}\n`);

        // Step 2: Initiate the connected account link
        const initResult = await initiateConnect(
          config,
          myAccountToken,
          connection,
          scopes,
          redirectUri,
          state
        );

        resolveAuthSession(initResult.auth_session);

        // Build the browser URL: connect_uri + ticket from connect_params
        const connectUrl = new URL(initResult.connect_uri);
        connectUrl.searchParams.set('ticket', initResult.connect_params.ticket);

        log('opening browser to %s', connectUrl.href);
        return open(connectUrl.href, browser ? { app: { name: browser } } : undefined);
      })
      .catch((err) => {
        shutdown();
        settle(() => reject(err));
      });
  });
}

/**
 * List connected accounts for the current user.
 */
export async function listConnectedAccounts(
  config: Auth0Config,
  refreshToken: string
): Promise<ConnectedAccountResult[]> {
  const myAccountToken = await getMyAccountToken(config, refreshToken);

  const res = await fetch(`https://${config.domain}/me/v1/connected-accounts/accounts`, {
    headers: { Authorization: `Bearer ${myAccountToken}` },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  await throwOnHttpError(res, 'Failed to list connected accounts');

  const data = (await res.json()) as { accounts: ConnectedAccountResult[] };
  return data.accounts ?? [];
}

/**
 * Delete a connected account by ID.
 */
export async function deleteConnectedAccount(
  config: Auth0Config,
  refreshToken: string,
  accountId: string
): Promise<void> {
  const myAccountToken = await getMyAccountToken(config, refreshToken);

  const res = await fetch(
    `https://${config.domain}/me/v1/connected-accounts/accounts/${accountId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${myAccountToken}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    }
  );

  await throwOnHttpError(res, 'Failed to delete connected account');
}
