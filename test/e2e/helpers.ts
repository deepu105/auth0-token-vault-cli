import { execFile, spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CredentialStore } from '../../src/store/credential-store.js';

const exec = promisify(execFile);

const CLI = join(import.meta.dirname, '../../dist/index.js');
const PRELOAD = join(import.meta.dirname, 'runtime/register-mocks.mjs');
const FAKE_BROWSER = join(import.meta.dirname, 'runtime/fake-browser.mjs');
const FAKE_AUTH0 = join(import.meta.dirname, 'runtime/fake-auth0.mjs');
const FAKE_NPX = join(import.meta.dirname, 'runtime/fake-npx.mjs');

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface E2eFixture {
  tempDir: string;
  store: CredentialStore;
  run: (args: string[]) => Promise<CliResult>;
  runInitWithStdin: (args: string[], stdinData: string) => Promise<CliResult>;
  cleanup: () => Promise<void>;
}

export async function setupE2eFixture(): Promise<E2eFixture> {
  const tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-e2e-'));
  await chmod(FAKE_BROWSER, 0o755);
  await chmod(FAKE_AUTH0, 0o755);
  await chmod(FAKE_NPX, 0o755);

  // Create a bin directory with symlinks to fake scripts (named auth0/npx)
  const fakeBinDir = join(tempDir, 'fake-bin');
  await mkdir(fakeBinDir, { recursive: true });
  await symlink(FAKE_AUTH0, join(fakeBinDir, 'auth0'));
  await symlink(FAKE_NPX, join(fakeBinDir, 'npx'));

  const store = new CredentialStore(tempDir);

  const run = async (args: string[]): Promise<CliResult> => {
    try {
      const result = await exec('node', ['--import', PRELOAD, CLI, ...args], {
        env: {
          ...process.env,
          AUTH0_DOMAIN: 'test.auth0.com',
          AUTH0_CLIENT_ID: 'test-client-id',
          AUTH0_CLIENT_SECRET: 'test-client-secret',
          AUTH0_TV_STORAGE: 'file',
          AUTH0_TV_CONFIG_DIR: tempDir,
          AUTH0_TV_BROWSER: FAKE_BROWSER,
          NO_COLOR: '1',
        },
        timeout: 15_000,
      });

      return { stdout: result.stdout, stderr: result.stderr, code: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        code: error.code ?? 1,
      };
    }
  };

  /**
   * Run the CLI with fake auth0/npx on PATH, piped stdin, and
   * AUTH0_TV_FORCE_INTERACTIVE=1 for testing the init command.
   * Does NOT set AUTH0_DOMAIN/CLIENT_ID/CLIENT_SECRET so init must
   * discover them via fake scripts.
   */
  const runInitWithStdin = async (args: string[], stdinData: string): Promise<CliResult> => {
    return new Promise((resolve) => {
      const child = spawn('node', ['--import', PRELOAD, CLI, ...args], {
        env: {
          ...process.env,
          PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
          AUTH0_TV_STORAGE: 'file',
          AUTH0_TV_CONFIG_DIR: tempDir,
          AUTH0_TV_BROWSER: FAKE_BROWSER,
          AUTH0_TV_FORCE_INTERACTIVE: '1',
          NO_COLOR: '1',
          // Deliberately NOT setting AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Write stdin data then close
      if (child.stdin) {
        child.stdin.write(stdinData);
        child.stdin.end();
      }

      child.on('close', (code) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
      child.on('error', (err) => {
        resolve({ stdout, stderr: stderr + err.message, code: 1 });
      });
    });
  };

  return {
    tempDir,
    store,
    run,
    runInitWithStdin,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
