import { createInterface } from 'node:readline/promises';
import type { StoredConfig } from '../store/types.js';

/**
 * Interactively prompt the user for Auth0 configuration.
 * Writes prompts to stderr to keep stdout clean for JSON output.
 */
export async function promptForConfig(): Promise<StoredConfig> {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Cannot prompt for configuration in non-interactive mode. ' +
        'Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET environment variables.'
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });

  try {
    process.stderr.write('\nAuth0 configuration required.\n\n');

    const domain = await askRequired(rl, 'Auth0 domain (e.g. your-tenant.auth0.com): ');
    const clientId = await askRequired(rl, 'Client ID: ');
    const clientSecret = await askRequired(rl, 'Client secret: ');
    const audience = (await rl.question('Audience (optional, press Enter to skip): ')).trim();

    return {
      domain: domain.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      clientId,
      clientSecret,
      audience: audience || undefined,
    };
  } finally {
    rl.close();
  }
}

async function askRequired(
  rl: ReturnType<typeof createInterface>,
  prompt: string
): Promise<string> {
  let value = '';
  while (!value) {
    value = (await rl.question(prompt)).trim();
    if (!value) {
      process.stderr.write('  This field is required.\n');
    }
  }
  return value;
}
