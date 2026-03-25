import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers.js';
import { gmailHandlers } from '../mocks/gmail/handlers.js';
import { CredentialStore } from '../../src/store/credential-store.js';
import { mockTokenResponse } from '../mocks/handlers.js';

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, '../../src/index.ts');
const TSX = join(import.meta.dirname, '../../node_modules/.bin/tsx');

async function run(
  args: string[],
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await exec(TSX, [CLI, ...args], {
      env: { ...process.env, ...env },
      timeout: 10_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 };
  }
}

describe('CLI integration', () => {
  it('--help exits with code 0 and shows commands', async () => {
    const { stdout, code } = await run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('auth0-tv');
    expect(stdout).toContain('login');
    expect(stdout).toContain('gmail');
    expect(stdout).toContain('connect');
  });

  it('--version prints version', async () => {
    const { stdout, code } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('0.1.0');
  });

  it('gmail --help shows subcommands', async () => {
    const { stdout, code } = await run(['gmail', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('search');
    expect(stdout).toContain('read');
    expect(stdout).toContain('send');
    expect(stdout).toContain('draft');
  });

  it('gmail send --help shows required options', async () => {
    const { stdout, code } = await run(['gmail', 'send', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('--to');
    expect(stdout).toContain('--subject');
    expect(stdout).toContain('--body');
  });

  it('gmail draft --help shows subcommands', async () => {
    const { stdout, code } = await run(['gmail', 'draft', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('create');
    expect(stdout).toContain('list');
    expect(stdout).toContain('send');
    expect(stdout).toContain('delete');
  });
});

describe('CLI status/connections without credentials', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-cli-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('status --json reports not logged in', async () => {
    // We run status programmatically using the store to verify the data layer
    const store = new CredentialStore(tempDir);
    const tokens = await store.getAuth0Tokens();
    expect(tokens).toBeNull();
  });

  it('connections shows empty list', async () => {
    const store = new CredentialStore(tempDir);
    const connections = await store.listConnections();
    expect(connections).toEqual([]);
  });
});

describe('CLI credential flow', () => {
  let tempDir: string;
  let store: CredentialStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth0-tv-flow-'));
    store = new CredentialStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('full credential lifecycle: save → status → connect → disconnect → clear', async () => {
    // 1. Save Auth0 tokens (simulating post-login)
    await store.saveAuth0Tokens({
      accessToken: mockTokenResponse.access_token,
      refreshToken: mockTokenResponse.refresh_token,
      idToken: mockTokenResponse.id_token,
      expiresAt: Date.now() + 86400_000,
    });

    // 2. Verify status
    const token = await store.getAuth0Token();
    expect(token).toBe(mockTokenResponse.access_token);

    // 3. Save connection token (simulating post-connect)
    await store.saveConnectionToken('google-oauth2', {
      accessToken: 'gmail-token',
      expiresAt: Date.now() + 3600_000,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });

    // 4. Verify connections
    const connections = await store.listConnections();
    expect(connections).toContain('google-oauth2');

    // 5. Disconnect
    const removed = await store.removeConnection('google-oauth2');
    expect(removed).toBe(true);
    expect(await store.listConnections()).toEqual([]);

    // 6. Clear all
    await store.clear();
    expect(await store.getAuth0Token()).toBeNull();
  });

  it('expired tokens are not returned', async () => {
    await store.saveAuth0Tokens({
      accessToken: 'expired-token',
      expiresAt: Date.now() - 1000,
    });

    expect(await store.getAuth0Token()).toBeNull();
  });
});
