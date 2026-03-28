import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CredentialStore } from '../../src/store/credential-store.js';

const exec = promisify(execFile);

const CLI = join(import.meta.dirname, '../../dist/index.js');
const PRELOAD = join(import.meta.dirname, 'runtime/register-mocks.mjs');
const FAKE_BROWSER = join(import.meta.dirname, 'runtime/fake-browser.mjs');

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface E2eFixture {
  tempDir: string;
  store: CredentialStore;
  run: (args: string[]) => Promise<CliResult>;
  cleanup: () => Promise<void>;
}

export async function setupE2eFixture(): Promise<E2eFixture> {
  const tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-e2e-'));
  await chmod(FAKE_BROWSER, 0o755);

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

  return {
    tempDir,
    store,
    run,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
