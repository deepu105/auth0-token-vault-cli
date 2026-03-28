import type { Command } from 'commander';
import { requireConfig } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_INVALID_INPUT,
  EXIT_NETWORK_ERROR,
  EXIT_SERVICE_ERROR,
} from '../utils/exit-codes.js';
import { CredentialStore } from '../store/credential-store.js';
import { exchangeForConnectionToken, TokenExchangeError } from '../auth/token-exchange.js';
import {
  getConnectionForService,
  getAvailableServices,
  getAllowedDomainsForService,
} from '../utils/service-registry.js';

/**
 * Validate that a URL's hostname is in the allowed domains list.
 * Checks exact match and wildcard subdomain matches (e.g. "*.googleapis.com").
 */
export function isDomainAllowed(url: URL, allowedDomains: string[]): boolean {
  const hostname = url.hostname.toLowerCase();
  for (const domain of allowedDomains) {
    const d = domain.toLowerCase();
    if (d.startsWith('*.')) {
      // Wildcard: *.example.com matches sub.example.com and a.b.example.com
      const suffix = d.slice(1); // ".example.com"
      if (hostname.endsWith(suffix) && hostname.length > suffix.length) return true;
    } else {
      if (hostname === d) return true;
    }
  }
  return false;
}

export function registerFetchCommand(program: Command) {
  program
    .command('fetch <service> <url>')
    .description('Make an authenticated HTTP request to an allowed URL using a service token')
    .option('-X, --method <method>', 'HTTP method', 'GET')
    .option('-H, --header <header...>', 'Additional headers (key: value)')
    .option('-d, --data <body>', 'Request body')
    .option('--data-file <path>', 'Read request body from file')
    .action(async (service: string, url: string, opts, cmd: Command) => {
      const serviceLower = service.toLowerCase();
      const connection = getConnectionForService(serviceLower);

      if (!connection) {
        outputError(
          {
            code: 'invalid_service',
            message: `Unknown service: ${service}. Available: ${getAvailableServices().join(', ')}`,
          },
          cmd
        );
        process.exit(EXIT_INVALID_INPUT);
      }

      // Parse and validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        outputError({ code: 'invalid_url', message: `Invalid URL: ${url}` }, cmd);
        process.exit(EXIT_INVALID_INPUT);
      }

      if (parsedUrl.protocol !== 'https:') {
        outputError({ code: 'invalid_url', message: 'Only HTTPS URLs are allowed.' }, cmd);
        process.exit(EXIT_INVALID_INPUT);
      }

      // Check allowed domains (stored settings override, fall back to registry defaults)
      const store = new CredentialStore();
      const settings = await store.getServiceSettings(serviceLower);
      const storedDomains = settings?.allowedDomains ?? [];
      const defaultDomains = getAllowedDomainsForService(serviceLower) ?? [];
      const allowedDomains =
        storedDomains.length > 0
          ? [...new Set([...storedDomains, ...defaultDomains])]
          : defaultDomains;

      if (allowedDomains.length === 0) {
        outputError(
          {
            code: 'no_allowed_domains',
            message: `No allowed domains configured for ${serviceLower}. Run \`auth0-tv connect ${serviceLower} --allowed-domains <domains>\` to set them.`,
          },
          cmd
        );
        process.exit(EXIT_INVALID_INPUT);
      }

      if (!isDomainAllowed(parsedUrl, allowedDomains)) {
        outputError(
          {
            code: 'domain_not_allowed',
            message: `Domain "${parsedUrl.hostname}" is not in the allowed list for ${serviceLower}. Allowed: ${allowedDomains.join(', ')}`,
          },
          cmd
        );
        process.exit(EXIT_INVALID_INPUT);
      }

      // Get token
      let token: string;
      try {
        const config = await requireConfig(store);
        token = await exchangeForConnectionToken(config, store, connection);
      } catch (err) {
        if (err instanceof TokenExchangeError) {
          outputError({ code: 'token_exchange_error', message: err.message }, cmd);
          process.exit(err.exitCode);
        }
        const message = err instanceof Error ? err.message : String(err);
        outputError({ code: 'auth_error', message }, cmd);
        process.exit(EXIT_AUTH_REQUIRED);
      }

      // Build request
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      if (opts.header) {
        for (const h of opts.header) {
          const colonIdx = h.indexOf(':');
          if (colonIdx === -1) {
            outputError(
              {
                code: 'invalid_header',
                message: `Invalid header format: "${h}". Use "Key: Value".`,
              },
              cmd
            );
            process.exit(EXIT_INVALID_INPUT);
          }
          const key = h.slice(0, colonIdx).trim();
          const value = h.slice(colonIdx + 1).trim();
          headers[key] = value;
        }
      }

      let body: string | undefined;
      if (opts.data) {
        body = opts.data;
      } else if (opts.dataFile) {
        const { readFile } = await import('node:fs/promises');
        const { resolve, normalize } = await import('node:path');
        const resolved = normalize(resolve(opts.dataFile));
        body = await readFile(resolved, 'utf-8');
      }

      // Execute request
      try {
        const response = await fetch(parsedUrl.toString(), {
          method: (opts.method as string).toUpperCase(),
          headers,
          ...(body ? { body } : {}),
        });

        const contentType = response.headers.get('content-type') ?? '';
        let responseBody: unknown;
        if (contentType.includes('application/json')) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        if (!response.ok) {
          output(
            {
              status: response.status,
              statusText: response.statusText,
              body: responseBody,
            },
            typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody, null, 2),
            cmd
          );
          process.exit(EXIT_SERVICE_ERROR);
        }

        output(
          {
            status: response.status,
            body: responseBody,
          },
          typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody, null, 2),
          cmd
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
          outputError({ code: 'network_error', message }, cmd);
          process.exit(EXIT_NETWORK_ERROR);
        }
        outputError({ code: 'fetch_error', message }, cmd);
        process.exit(EXIT_SERVICE_ERROR);
      }
    });
}
