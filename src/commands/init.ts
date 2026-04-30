import type { Command } from 'commander';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import chalk from 'chalk';
import * as nodePty from 'node-pty';
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

/**
 * Run a command inside a pseudo-TTY so it stays interactive, while
 * capturing all output. The output is piped to the real stdout so the
 * user sees it as normal.
 *
 * Falls back to plain inherited stdio if node-pty fails to spawn (e.g. the
 * native binding isn't available for this Node/arch). In that case the
 * captured output is empty and the caller must prompt for any values it
 * would otherwise have parsed.
 */
async function runInteractiveCaptured(
  cmd: string,
  args: string[]
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve, reject) => {
    let pty: ReturnType<typeof nodePty.spawn>;
    try {
      pty = nodePty.spawn(cmd, args, {
        name: 'xterm-color',
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
    } catch (err) {
      reject(err);
      return;
    }

    const chunks: string[] = [];

    pty.onData((data) => {
      chunks.push(data);
      process.stdout.write(data);
    });

    // Forward user keystrokes to the PTY
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const onData = (data: Buffer) => pty.write(data.toString());
    process.stdin.on('data', onData);

    pty.onExit(({ exitCode }) => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      resolve({ ok: exitCode === 0, output: chunks.join('') });
    });
  });
}

/** Strip ANSI escape sequences from a string. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Parse the Client ID from `configure-auth0-token-vault` output.
 * Looks for a line like "Your application Client ID: <id>".
 * Strips ANSI escape codes first since the output comes from a PTY.
 */
export function parseClientId(output: string): string | undefined {
  const clean = stripAnsi(output);
  const match = clean.match(/Client\s+ID:\s*(\S+)/i);
  return match?.[1];
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

        const callbacks = CALLBACK_PORTS.map((p) => `http://127.0.0.1:${p}/callback`).join(',');
        const logoutUrls = CALLBACK_PORTS.map((p) => `http://127.0.0.1:${p}`).join(',');

        const configArgs = [
          'configure-auth0-token-vault',
          '--',
          '--flavor=refresh_token_exchange',
          `--callback-urls=${callbacks}`,
          `--logout-urls=${logoutUrls}`,
        ];

        let configResult: { ok: boolean; output: string };
        try {
          configResult = await runInteractiveCaptured('npx', configArgs);
        } catch (err: unknown) {
          // node-pty native binding unavailable on this platform/Node build.
          // Fall back to plain inherited stdio — we lose output capture, so
          // the Client ID parsing below will miss and we'll prompt for it.
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `${chalk.yellow('!')} Interactive capture unavailable (${message}). ` +
              `Falling back to plain mode — you'll be asked to copy the Client ID manually.\n\n`
          );
          const ok = await runInherited('npx', configArgs);
          configResult = { ok, output: '' };
        }

        if (!configResult.ok) {
          throw new Error(
            'Token Vault configuration failed. Fix the issue and run `auth0-tv init` again.'
          );
        }

        // Step 2: Get Client ID (auto-detect from output, fall back to prompt)
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
        });

        try {
          process.stderr.write('\n');
          let clientId = parseClientId(configResult.output);
          if (clientId) {
            process.stderr.write(`${chalk.green('✓')} Detected Client ID: ${clientId}\n`);
          } else {
            clientId = await askRequired(rl, 'Enter the Client ID from the output above: ');
          }

          // Step 3: Retrieve credentials
          process.stderr.write(`\n${chalk.bold('Step 2: Retrieve credentials')}\n`);

          const { domain, clientSecret } = await getAppCredentials(clientId, rl);

          process.stderr.write(`${chalk.green('✓')} Credentials retrieved.\n`);
          process.stderr.write(`  Domain:    ${domain}\n`);
          process.stderr.write(`  Client ID: ${clientId}\n\n`);

          // Step 4: Login — delegate to shared login flow
          process.stderr.write(`${chalk.bold('Step 3: Authenticate')}\n`);

          // Set env vars so resolveConfigWithPrompts finds them without prompting
          process.env.AUTH0_DOMAIN = domain;
          process.env.AUTH0_CLIENT_ID = clientId;
          process.env.AUTH0_CLIENT_SECRET = clientSecret;

          const globals = cmd.optsWithGlobals();
          const browser = resolveBrowser(globals.browser);
          const port = resolveCallbackPort(globals.port);

          await runLogin({ existing: null, browser, port });

          // Step 5: Next steps
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
