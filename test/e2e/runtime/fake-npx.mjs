#!/usr/bin/env node
/**
 * Fake npx for e2e init tests.
 *
 * Simulates `npx configure-auth0-token-vault -- --flavor=refresh_token_exchange`.
 * Just prints a success message and exits.
 */
process.stdout.write('=== Auth0 Token Vault Configuration ===\n');
process.stdout.write('Configuring Token Vault with flavor: refresh_token_exchange\n');
process.stdout.write('✓ Token Vault configured successfully\n');
process.stdout.write('\n');
process.stdout.write('Your application Client ID: test-client-id\n');
process.exit(0);
