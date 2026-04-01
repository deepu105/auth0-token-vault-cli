#!/usr/bin/env node
/**
 * Fake auth0 CLI for e2e init tests.
 *
 * Handles the subcommands used by `auth0-tv init`:
 *   - apps update <id> --callbacks <urls> --logout-urls <urls>
 *   - apps show <id> --reveal-secrets --json
 *   - tenants list --json
 */
const args = process.argv.slice(2);

if (args[0] === 'apps' && args[1] === 'update') {
  process.stderr.write('Application updated successfully\n');
  process.exit(0);
}

if (args[0] === 'apps' && args[1] === 'show') {
  if (args.includes('--json')) {
    process.stdout.write(
      JSON.stringify({
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        name: 'Token Vault Test App',
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

if (args[0] === 'tenants' && args[1] === 'list') {
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify([{ name: 'test.auth0.com' }]));
    process.stdout.write('\n');
  } else {
    process.stdout.write('test.auth0.com\n');
  }
  process.exit(0);
}

process.stderr.write(`Fake auth0: unhandled command: ${args.join(' ')}\n`);
process.exit(1);
