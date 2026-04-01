import type { Command } from 'commander';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { resolveBrowser, resolveCallbackPort } from '../utils/config.js';
import { output, outputError } from '../utils/output.js';
import { EXIT_GENERAL } from '../utils/exit-codes.js';
import { cleanDomain, askRequired } from '../utils/prompt.js';
import { CALLBACK_PORTS } from '../auth/browser.js';
import { runLogin } from './login.js';

const execFileAsync = promisify(execFile);

/** Check whether a command exists on the system PATH. */
async function isCommandAvailable(cmd: string): Promise<boolean> {
  const check = process.platform === 'win32' ? 'where' : 'which';
  try {
    await execFileAsync(check, [cmd]);
    return true;
  } catch {
    return false;
  }
}

/** Run a command with inherited stdio (interactive). Returns true on success. */
async function runInherited(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

/** Run a command and capture its stdout. Throws on non-zero exit. */
async function runCaptured(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args);
  return stdout;
}

/**
 * Parse a single tenant domain from `auth0 tenants list --json` output.
 * Returns the domain when exactly one tenant exists, undefined otherwise.
 */
export function parseSingleTenant(jsonStr: string): string | undefined {
  try {
    const tenants = JSON.parse(jsonStr);
    if (Array.isArray(tenants) && tenants.length === 1) {
      return tenants[0].name || tenants[0].domain;
    }
  } catch {
    // ignore parse errors
  }
  return undefined;
}

/**
 * Parse the client_secret from `auth0 apps show --reveal-secrets --json` output.
 */
export function parseAppSecret(jsonStr: string): string | undefined {
  try {
    const app = JSON.parse(jsonStr);
    return app.client_secret || app.clientSecret;
  } catch {
    // ignore parse errors
  }
  return undefined;
}

/** Try to auto-detect the Auth0 tenant domain from the auth0 CLI. */
async function detectDomain(rl: ReturnType<typeof createInterface>): Promise<string | undefined> {
  try {
    const jsonOutput = await runCaptured('auth0', ['tenants', 'list', '--json']);
    const single = parseSingleTenant(jsonOutput);
    if (single) return single;

    // Multiple tenants — offer interactive selection
    const tenants = JSON.parse(jsonOutput);
    if (Array.isArray(tenants) && tenants.length > 1) {
      process.stderr.write('\nMultiple tenants detected:\n');
      tenants.forEach((t: { name?: string }, i: number) => {
        process.stderr.write(`  ${i + 1}. ${t.name || 'unknown'}\n`);
      });
      const choice = (await rl.question('Select tenant number: ')).trim();
      const idx = parseInt(choice, 10);
      if (idx > 0 && idx <= tenants.length) {
        return tenants[idx - 1].name || tenants[idx - 1].domain;
      }
    }
  } catch {
    // auth0 CLI not logged in or other error
  }
  return undefined;
}

/** Retrieve domain and client secret from the auth0 CLI, falling back to prompts. */
async function getAppCredentials(
  clientId: string,
  rl: ReturnType<typeof createInterface>
): Promise<{ domain: string; clientSecret: string }> {
  // Try JSON output first
  try {
    const appOutput = await runCaptured('auth0', [
      'apps',
      'show',
      clientId,
      '--reveal-secrets',
      '--json',
    ]);
    const secret = parseAppSecret(appOutput);
    if (secret) {
      const domain = await detectDomain(rl);
      if (domain) {
        return { domain: cleanDomain(domain), clientSecret: secret };
      }
    }
  } catch {
    // fall through to manual prompt
  }

  // Fall back: show the app details and prompt
  process.stderr.write(
    `${chalk.yellow('!')} Could not auto-detect credentials. Retrieving app details...\n\n`
  );
  await runInherited('auth0', ['apps', 'show', clientId, '--reveal-secrets']);

  process.stderr.write('\n');
  const domain = await askRequired(rl, 'Auth0 domain (e.g. your-tenant.eu.auth0.com): ');
  const secret = await askRequired(rl, 'Client secret from above: ');
  return { domain: cleanDomain(domain), clientSecret: secret };
}

export function registerInitCommand(program: Command) {
  program
    .command('init')
    .description('Interactive guided setup wizard')
    .action(async (_opts, cmd: Command) => {
      try {
        process.stderr.write(`${chalk.bold('Auth0 Token Vault CLI — Setup Wizard')}\n\n`);

        // Check interactive mode
        if (!process.stdin.isTTY && !process.env.AUTH0_TV_FORCE_INTERACTIVE) {
          throw new Error('The init command requires an interactive terminal.');
        }

        // Check prerequisites
        if (!(await isCommandAvailable('auth0'))) {
          process.stderr.write(
            `${chalk.yellow('!')} The Auth0 CLI is required but not installed.\n\n`
          );
          if (process.platform === 'darwin') {
            process.stderr.write('  Install via Homebrew:\n');
            process.stderr.write('    brew tap auth0/auth0-cli && brew install auth0\n');
          } else if (process.platform === 'win32') {
            process.stderr.write('  Install via Scoop:\n');
            process.stderr.write(
              '    scoop bucket add auth0 https://github.com/auth0/scoop-auth0-cli\n'
            );
            process.stderr.write('    scoop install auth0-cli\n');
          } else {
            process.stderr.write('  Install via curl:\n');
            process.stderr.write(
              '    curl -sSfL https://raw.githubusercontent.com/auth0/auth0-cli/main/install.sh | sh\n'
            );
          }
          process.stderr.write('\n');
          throw new Error('auth0 CLI not found. Install it and run `auth0-tv init` again.');
        }

        if (!(await isCommandAvailable('npx'))) {
          process.stderr.write(`${chalk.yellow('!')} npx is required but not installed.\n\n`);
          process.stderr.write('  Install Node.js: https://nodejs.org/\n');
          throw new Error('npx not found. Install Node.js and run `auth0-tv init` again.');
        }

        // Step 1: Configure Token Vault
        process.stderr.write(`${chalk.bold('Step 1: Configure Auth0 Token Vault')}\n`);
        process.stderr.write('The configuration wizard will guide you through setting up Auth0\n');
        process.stderr.write('Token Vault for your tenant.\n\n');

        const configOk = await runInherited('npx', [
          'configure-auth0-token-vault',
          '--',
          '--flavor=refresh_token_exchange',
        ]);

        if (!configOk) {
          throw new Error(
            'Token Vault configuration failed. Fix the issue and run `auth0-tv init` again.'
          );
        }

        // Step 2: Get Client ID
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
        });

        try {
          process.stderr.write('\n');
          const clientId = await askRequired(rl, 'Enter the Client ID from the output above: ');

          // Step 3: Update callback URLs
          process.stderr.write(`\n${chalk.bold('Step 2: Configure callback URLs')}\n`);

          const callbacks = CALLBACK_PORTS.map((p) => `http://127.0.0.1:${p}/callback`).join(',');
          const logoutUrls = CALLBACK_PORTS.map((p) => `http://127.0.0.1:${p}`).join(',');

          const updateOk = await runInherited('auth0', [
            'apps',
            'update',
            clientId,
            '--callbacks',
            callbacks,
            '--logout-urls',
            logoutUrls,
          ]);

          if (!updateOk) {
            throw new Error(
              `Failed to update callback URLs. Run manually:\n  ` +
                `auth0 apps update ${clientId} --callbacks "${callbacks}" --logout-urls "${logoutUrls}"`
            );
          }
          process.stderr.write(`${chalk.green('✓')} Callback URLs configured.\n\n`);

          // Step 4: Retrieve credentials
          process.stderr.write(`${chalk.bold('Step 3: Retrieve credentials')}\n`);

          const { domain, clientSecret } = await getAppCredentials(clientId, rl);

          process.stderr.write(`${chalk.green('✓')} Credentials retrieved.\n`);
          process.stderr.write(`  Domain:    ${domain}\n`);
          process.stderr.write(`  Client ID: ${clientId}\n\n`);

          // Step 5: Login — delegate to shared login flow
          process.stderr.write(`${chalk.bold('Step 4: Authenticate')}\n`);

          // Set env vars so resolveConfigWithPrompts finds them without prompting
          process.env.AUTH0_DOMAIN = domain;
          process.env.AUTH0_CLIENT_ID = clientId;
          process.env.AUTH0_CLIENT_SECRET = clientSecret;

          const globals = cmd.optsWithGlobals();
          const browser = resolveBrowser(globals.browser);
          const port = resolveCallbackPort(globals.port);

          await runLogin({ existing: null, browser, port });

          // Step 6: Next steps
          process.stderr.write(`\n${chalk.bold('🎉 Setup complete!')}\n\n`);
          process.stderr.write(`${chalk.bold('Next steps:')}\n`);
          process.stderr.write(`  ${chalk.dim('1.')} Connect a provider:\n`);
          process.stderr.write('     auth0-tv connect gmail\n');
          process.stderr.write('     auth0-tv connect github\n');
          process.stderr.write('     auth0-tv connect slack\n');
          process.stderr.write(`  ${chalk.dim('2.')} Make authenticated API calls:\n`);
          process.stderr.write(
            '     auth0-tv fetch gmail https://gmail.googleapis.com/gmail/v1/users/me/messages\n'
          );
          process.stderr.write(`  ${chalk.dim('3.')} Check status:\n`);
          process.stderr.write('     auth0-tv status\n');

          output({ status: 'setup_complete' }, '', cmd);
        } finally {
          rl.close();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        outputError({ code: 'init_failed', message }, cmd);
        process.exit(EXIT_GENERAL);
      }
    });
}
