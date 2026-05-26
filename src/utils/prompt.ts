import * as p from '@clack/prompts';
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

  p.log.info('Auth0 configuration required.');

  const results = await p.group(
    {
      domain: () =>
        merged.domain
          ? Promise.resolve(merged.domain)
          : p.text({
              message: 'Auth0 domain:',
              placeholder: 'your-tenant.eu.auth0.com',
              validate: (value) => {
                if (!value) return 'Domain is required';
              },
            }),
      clientId: () =>
        merged.clientId
          ? Promise.resolve(merged.clientId)
          : p.text({
              message: 'Client ID:',
              validate: (value) => {
                if (!value) return 'Client ID is required';
              },
            }),
      clientSecret: () =>
        merged.clientSecret
          ? Promise.resolve(merged.clientSecret)
          : p.password({
              message: 'Client secret:',
              validate: (value) => {
                if (!value) return 'Client secret is required';
              },
            }),
      audience: () =>
        merged.audience
          ? Promise.resolve(merged.audience)
          : p.text({
              message: 'Audience (optional, press Enter to skip):',
              placeholder: '',
            }),
    },
    {
      onCancel: () => {
        p.cancel('Configuration cancelled.');
        process.exit(1);
      },
    }
  );

  return {
    domain: cleanDomain(results.domain),
    clientId: results.clientId,
    clientSecret: results.clientSecret,
    audience: results.audience || undefined,
  };
}

/** Strip protocol prefix and trailing slashes from a domain string.
 * Note: No regex validation is applied here. The result is always used in
 * `new URL(`https://${domain}`)` constructors downstream, which reject
 * malformed domains, providing defense-in-depth against injection. */
export function cleanDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
