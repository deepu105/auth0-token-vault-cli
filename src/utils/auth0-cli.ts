import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from './logger.js';

const execFileAsync = promisify(execFile);

export interface Auth0CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class Auth0CliError extends Error {
  stdout: string;
  stderr: string;
  exitCode: number;

  constructor(message: string, result: Auth0CommandResult) {
    super(message);
    this.name = 'Auth0CliError';
    this.stdout = result.stdout;
    this.stderr = result.stderr;
    this.exitCode = result.exitCode;
  }
}

/** Run an auth0 CLI command and return stdout. Throws Auth0CliError on non-zero exit. */
export async function runAuth0Command(
  args: string[],
  options?: { stdio?: 'inherit'; timeout?: number }
): Promise<string> {
  log('auth0 %s', args.join(' '));

  if (options?.stdio === 'inherit') {
    return new Promise((resolve, reject) => {
      const child = spawn('auth0', args, { stdio: 'inherit' });
      child.on('close', (code) => {
        if (code === 0) resolve('');
        else
          reject(
            new Auth0CliError(`auth0 ${args.join(' ')} exited with code ${code}`, {
              stdout: '',
              stderr: '',
              exitCode: code ?? 1,
            })
          );
      });
      child.on('error', (err) => reject(err));
    });
  }

  const timeout = options?.timeout ?? 30_000;
  try {
    const { stdout } = await execFileAsync('auth0', args, { timeout });
    log('auth0 stdout: %s', stdout.substring(0, 200));
    return stdout;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    const result: Auth0CommandResult = {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    };
    throw new Auth0CliError(`Command failed: auth0 ${args.join(' ')}`, result);
  }
}

/**
 * Call the Auth0 Management API via `auth0 api <method> <path>`.
 * Accepts an optional JSON body passed via stdin.
 */
export async function runAuth0Api(
  method: string,
  path: string,
  data?: Record<string, unknown>
): Promise<string> {
  const args = ['api', method, path, '--no-input'];
  log('auth0 api %s %s', method, path);

  const timeout = 30_000;

  if (data) {
    return runAuth0ApiWithInput(args, JSON.stringify(data), timeout);
  }

  try {
    const { stdout } = await execFileAsync('auth0', args, { timeout });
    log('auth0 api stdout: %s', stdout.substring(0, 200));
    return stdout;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    throw new Auth0CliError(`Command failed: auth0 api ${method} ${path}`, {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    });
  }
}

async function runAuth0ApiWithInput(
  args: string[],
  input: string,
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('auth0', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        log('auth0 api stdout: %s', stdout.substring(0, 200));
        resolve(stdout);
      } else {
        reject(
          new Auth0CliError(`Command failed: auth0 ${args.join(' ')}`, {
            stdout,
            stderr,
            exitCode: code ?? 1,
          })
        );
      }
    });
    child.on('error', (err) => reject(err));

    child.stdin?.write(input);
    child.stdin?.end();
  });
}

/** Check whether the auth0 CLI is installed. */
export async function isAuth0CliInstalled(): Promise<boolean> {
  try {
    await runAuth0Command(['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Check whether the user is logged in to the auth0 CLI. */
export async function isAuth0LoggedIn(): Promise<boolean> {
  try {
    const stdout = await runAuth0Command(['tenants', 'list', '--json', '--no-input']);
    const tenants = JSON.parse(stdout || '[]');
    return tenants.length > 0;
  } catch {
    return false;
  }
}

/** Get the active tenant domain from auth0 CLI. */
export async function getActiveTenantDomain(): Promise<string> {
  const stdout = await runAuth0Command(['tenants', 'list', '--json', '--no-input']);
  const tenants = JSON.parse(stdout || '[]');
  if (tenants.length === 0) {
    throw new Error('No tenants found. Please log in first.');
  }
  const active = tenants.find((t: { active?: boolean }) => t.active) || tenants[0];
  return active.name || active.domain;
}
