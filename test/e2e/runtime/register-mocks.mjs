import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const originalFetch = globalThis.fetch.bind(globalThis);

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'test.auth0.com';
const AUTH0_BASE = `https://${AUTH0_DOMAIN}`;
const DEBUG = process.env.AUTH0_TV_E2E_DEBUG === '1';

const stateDir = process.env.AUTH0_TV_CONFIG_DIR || process.cwd();
const remoteAccountsFile = join(stateDir, 'e2e-remote-accounts.json');

const mockMessageList = {
  messages: [
    { id: 'msg-1', threadId: 'thread-1' },
    { id: 'msg-2', threadId: 'thread-2' },
  ],
  resultSizeEstimate: 2,
};

const mockMessageFull = {
  id: 'msg-1',
  threadId: 'thread-1',
  labelIds: ['INBOX'],
  snippet: 'Snippet for msg-1',
  payload: {
    headers: [
      { name: 'From', value: 'sender@example.com' },
      { name: 'To', value: 'me@example.com' },
      { name: 'Subject', value: 'Hello World' },
      { name: 'Date', value: 'Wed, 25 Mar 2026 10:00:00 +0000' },
      { name: 'Message-ID', value: '<abc123@example.com>' },
    ],
    mimeType: 'text/plain',
    body: {
      data: Buffer.from('This is the email body.').toString('base64url'),
    },
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyResponse(status = 204) {
  return new Response(null, { status });
}

async function loadRemoteAccounts() {
  try {
    const raw = await readFile(remoteAccountsFile, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveRemoteAccounts(accounts) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(remoteAccountsFile, JSON.stringify(accounts, null, 2), 'utf-8');
}

async function parseBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await request.json();
  }

  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text));
}

function buildDiscoveryResponse() {
  return {
    issuer: `${AUTH0_BASE}/`,
    authorization_endpoint: `${AUTH0_BASE}/authorize`,
    token_endpoint: `${AUTH0_BASE}/oauth/token`,
    userinfo_endpoint: `${AUTH0_BASE}/userinfo`,
    jwks_uri: `${AUTH0_BASE}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
  };
}

function buildMessageMetadata(id) {
  return {
    id,
    threadId: `thread-${id}`,
    snippet: `Snippet for ${id}`,
    labelIds: ['INBOX'],
    payload: {
      headers: [
        { name: 'From', value: 'sender@example.com' },
        { name: 'Subject', value: `Test subject ${id}` },
        { name: 'Date', value: 'Wed, 25 Mar 2026 10:00:00 +0000' },
      ],
    },
  };
}

function debugLog(...args) {
  if (DEBUG) {
    process.stderr.write(`${args.join(' ')}\n`);
  }
}

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  debugLog('FETCH', method, url.href);

  if (url.origin === AUTH0_BASE && url.pathname === '/.well-known/openid-configuration') {
    return jsonResponse(buildDiscoveryResponse());
  }

  if (url.origin === AUTH0_BASE && url.pathname === '/oauth/token' && method === 'POST') {
    const body = await parseBody(request);

    if (
      body.grant_type ===
      'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token'
    ) {
      const remoteAccounts = await loadRemoteAccounts();
      const connection = String(body.connection || '');
      const authorized = remoteAccounts.some((account) => account.connection === connection);
      if (!authorized) {
        return jsonResponse(
          {
            error: 'access_denied',
            error_description: `Connection ${connection} is not authorized`,
          },
          403
        );
      }

      return jsonResponse({
        access_token: `mock-${connection}-access-token`,
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.modify',
      });
    }

    if (body.grant_type === 'refresh_token') {
      if (body.audience === `${AUTH0_BASE}/me/`) {
        return jsonResponse({
          access_token: 'mock-my-account-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope:
            'create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts',
        });
      }

      return jsonResponse({
        access_token: 'refreshed-access-token',
        expires_in: 86400,
        token_type: 'Bearer',
      });
    }

    if (body.grant_type === 'authorization_code') {
      return jsonResponse({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 86400,
        token_type: 'Bearer',
        scope: 'openid profile email offline_access',
      });
    }

    return jsonResponse(
      { error: 'unsupported_grant_type', error_description: 'Unsupported grant type' },
      400
    );
  }

  if (
    url.origin === AUTH0_BASE &&
    url.pathname === '/me/v1/connected-accounts/connect' &&
    method === 'POST'
  ) {
    const body = await request.json();
    process.env.AUTH0_TV_E2E_CONNECT_REDIRECT_URI = String(body.redirect_uri || '');
    process.env.AUTH0_TV_E2E_CONNECT_STATE = String(body.state || '');
    // Store the connection and scopes for the complete endpoint to use
    process.env.AUTH0_TV_E2E_CONNECT_CONNECTION = String(body.connection || '');
    process.env.AUTH0_TV_E2E_CONNECT_SCOPES = JSON.stringify(body.scopes || []);

    return jsonResponse({
      auth_session: 'mock-auth-session-123',
      connect_uri: `${AUTH0_BASE}/connected-accounts/connect`,
      connect_params: { ticket: 'mock-ticket' },
      expires_in: 300,
    });
  }

  if (
    url.origin === AUTH0_BASE &&
    url.pathname === '/me/v1/connected-accounts/complete' &&
    method === 'POST'
  ) {
    const connection = process.env.AUTH0_TV_E2E_CONNECT_CONNECTION || 'google-oauth2';
    let scopes;
    try {
      scopes = JSON.parse(process.env.AUTH0_TV_E2E_CONNECT_SCOPES || '[]');
    } catch {
      scopes = [];
    }
    const accountId = `ca_${connection.replace(/[^a-z0-9]/gi, '_')}`;

    const remoteAccounts = await loadRemoteAccounts();
    const existing = remoteAccounts.find((account) => account.connection === connection);
    if (!existing) {
      remoteAccounts.push({
        id: accountId,
        connection,
        scopes,
      });
      await saveRemoteAccounts(remoteAccounts);
    }

    return jsonResponse({
      id: accountId,
      connection,
      scopes,
      access_type: 'offline',
      created_at: '2026-03-26T00:00:00.000Z',
    });
  }

  if (
    url.origin === AUTH0_BASE &&
    url.pathname === '/me/v1/connected-accounts/accounts' &&
    method === 'GET'
  ) {
    const remoteAccounts = await loadRemoteAccounts();
    return jsonResponse({ accounts: remoteAccounts });
  }

  if (
    url.origin === AUTH0_BASE &&
    url.pathname.startsWith('/me/v1/connected-accounts/accounts/') &&
    method === 'DELETE'
  ) {
    const accountId = url.pathname.split('/').pop();
    const remoteAccounts = await loadRemoteAccounts();
    const index = remoteAccounts.findIndex((account) => account.id === accountId);
    if (index >= 0) {
      remoteAccounts.splice(index, 1);
      await saveRemoteAccounts(remoteAccounts);
    }
    return emptyResponse();
  }

  if (
    url.origin === 'https://gmail.googleapis.com' &&
    url.pathname === '/gmail/v1/users/me/messages'
  ) {
    return jsonResponse(mockMessageList);
  }

  if (
    url.origin === 'https://gmail.googleapis.com' &&
    url.pathname.startsWith('/gmail/v1/users/me/messages/') &&
    method === 'GET'
  ) {
    const id = url.pathname.split('/').pop();
    const format = url.searchParams.get('format');

    if (format === 'full' || !format) {
      return jsonResponse(id === 'msg-1' ? mockMessageFull : { ...mockMessageFull, id });
    }

    return jsonResponse(buildMessageMetadata(id));
  }

  if (
    url.origin === 'https://gmail.googleapis.com' &&
    url.pathname.startsWith('/gmail/v1/users/me/messages/') &&
    url.pathname.endsWith('/trash') &&
    method === 'POST'
  ) {
    const parts = url.pathname.split('/');
    return jsonResponse({ id: parts[parts.length - 2], labelIds: ['TRASH'] });
  }

  if (url.origin === 'https://api.example.test' && url.pathname === '/echo') {
    return jsonResponse({
      ok: true,
      method,
      authorization: request.headers.get('authorization'),
    });
  }

  debugLog('MISS', method, url.href);
  return originalFetch(input, init);
};

globalThis.window = {
  ...(globalThis.window || {}),
  fetch: globalThis.fetch,
};
