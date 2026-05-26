#!/usr/bin/env node
/**
 * Fake auth0 CLI for e2e init tests.
 *
 * Handles the subcommands used by `auth0-tv init` (inlined configure-token-vault):
 *   - --version
 *   - tenants list --json --no-input
 *   - apps create --name <name> --type regular --json --no-input [--callbacks] [--logout-urls]
 *   - apps show <id> [--reveal-secrets] --json --no-input
 *   - api get <path> --no-input
 *   - api patch <path> --no-input (reads JSON from stdin)
 *   - api post <path> --no-input (reads JSON from stdin)
 *   - login --scopes create:client_grants
 */
const args = process.argv.slice(2);

if (args[0] === '--version') {
  process.stdout.write('auth0 version 1.6.0\n');
  process.exit(0);
}

if (args[0] === 'login') {
  process.stderr.write('Login successful!\n');
  process.exit(0);
}

if (args[0] === 'tenants' && args[1] === 'list') {
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify([{ name: 'test.auth0.com', active: true }]));
    process.stdout.write('\n');
  } else {
    process.stdout.write('test.auth0.com\n');
  }
  process.exit(0);
}

if (args[0] === 'apps' && args[1] === 'create') {
  const nameIdx = args.indexOf('--name');
  const name = nameIdx >= 0 ? args[nameIdx + 1] : 'Token Vault App';
  process.stdout.write(
    JSON.stringify({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      name,
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'client_secret_post',
    })
  );
  process.stdout.write('\n');
  process.exit(0);
}

if (args[0] === 'apps' && args[1] === 'list') {
  if (args.includes('--json')) {
    process.stdout.write(
      JSON.stringify([
        { client_id: 'test-client-id', name: 'Token Vault Test App' },
        { client_id: 'other-app-id', name: 'Other App' },
        { client_id: 'all-apps', name: 'All Applications' },
      ])
    );
    process.stdout.write('\n');
  }
  process.exit(0);
}

if (args[0] === 'apps' && args[1] === 'show') {
  const appId = args[2];
  if (args.includes('--json')) {
    process.stdout.write(
      JSON.stringify({
        client_id: appId || 'test-client-id',
        client_secret: 'test-client-secret',
        name: 'Token Vault Test App',
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'client_secret_post',
        refresh_token: { policies: [] },
      })
    );
    process.stdout.write('\n');
  } else {
    process.stdout.write('=== Token Vault Test App ===\n');
    process.stdout.write('Client ID:      test-client-id\n');
    process.stdout.write('Client Secret:  test-client-secret\n');
  }
  process.exit(0);
}

if (args[0] === 'api') {
  const method = args[1];
  const path = args[2];

  // For all API calls, consume stdin if any (PATCH/POST send JSON body)
  let body = '';
  if (method === 'patch' || method === 'post') {
    const chunks = [];
    process.stdin.resume();
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      body = Buffer.concat(chunks).toString();
      handleApi(method, path, body);
    });
  } else {
    handleApi(method, path, body);
  }
}

function handleApi(method, path, body) {
  // GET connections
  if (method === 'get' && path === 'connections') {
    process.stdout.write(
      JSON.stringify([
        {
          id: 'conn-1',
          name: 'google-oauth2',
          strategy: 'google-oauth2',
          options: {},
          enabled_clients: [],
        },
      ])
    );
    process.stdout.write('\n');
    process.exit(0);
  }

  // GET resource-servers (My Account API check)
  if (method === 'get' && path.startsWith('resource-servers')) {
    process.stdout.write(
      JSON.stringify([
        {
          id: 'rs-1',
          identifier: 'https://test.auth0.com/me/',
          scopes: [
            { value: 'read:me', description: 'Read user profile' },
            { value: 'create:me:connected_accounts', description: 'Link' },
            { value: 'read:me:connected_accounts', description: 'Read' },
            { value: 'delete:me:connected_accounts', description: 'Unlink' },
          ],
          subject_type_authorization: { user: { policy: 'require_client_grant' } },
        },
      ])
    );
    process.stdout.write('\n');
    process.exit(0);
  }

  // GET client-grants
  if (method === 'get' && path.startsWith('client-grants')) {
    process.stdout.write(JSON.stringify([]));
    process.stdout.write('\n');
    process.exit(0);
  }

  // PATCH/POST — just acknowledge
  if (method === 'patch' || method === 'post') {
    process.stdout.write(JSON.stringify({ ok: true }));
    process.stdout.write('\n');
    process.exit(0);
  }

  process.stderr.write(`Fake auth0 api: unhandled ${method} ${path}\n`);
  process.exit(1);
}

// If we didn't match anything above
if (args[0] !== 'api') {
  process.stderr.write(`Fake auth0: unhandled command: ${args.join(' ')}\n`);
  process.exit(1);
}
