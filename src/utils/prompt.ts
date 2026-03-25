import { createInterface } from 'node:readline/promises';
import type { StoredConfig } from '../store/types.js';
import { mergeConfigFromEnvAndStore } from './config.js';

/**
 * Resolve Auth0 config by merging env vars + stored values, then
 * interactively prompting for any fields still missing.
 */
export async function resolveConfigWithPrompts(
  existing?: StoredConfig | null
): Promise<StoredConfig> {
  const merged = mergeConfigFromEnvAndStore(existing);

  // Everything resolved — no prompts needed
  if (merged.missing.length === 0) {
    return {
      domain: cleanDomain(merged.domain!),
      clientId: merged.clientId!,
      clientSecret: merged.clientSecret!,
      audience: merged.audience || undefined,
    };
  }

  // Need to prompt — check TTY
  if (!process.stdin.isTTY) {
    throw new Error(
      `Cannot prompt for configuration in non-interactive mode. ` +
        `Set ${merged.missing.join(', ')} environment variable${merged.missing.length > 1 ? 's' : ''}.`
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });

  try {
    process.stderr.write('\nAuth0 configuration required.\n\n');

    const domain = merged.domain || (await askRequired(rl, 'Auth0 domain (e.g. your-tenant.eu.auth0.com): '));
    const clientId = merged.clientId || (await askRequired(rl, 'Client ID: '));
    const clientSecret = merged.clientSecret || (await askRequired(rl, 'Client secret: '));
    const audience =
      merged.audience || (await rl.question('Audience (optional, press Enter to skip): ')).trim();

    return {
      domain: cleanDomain(domain),
      clientId,
      clientSecret,
      audience: audience || undefined,
    };
  } finally {
    rl.close();
  }
}

function cleanDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
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
