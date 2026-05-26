import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TokenVaultConfig } from '../../src/commands/init/configure-token-vault.js';

// Mock the auth0-cli utilities
vi.mock('../../src/utils/auth0-cli.js', () => ({
  isAuth0CliInstalled: vi.fn(),
  isAuth0LoggedIn: vi.fn(),
  getActiveTenantDomain: vi.fn(),
  runAuth0Command: vi.fn(),
  runAuth0Api: vi.fn(),
}));

// Dynamic import after mocking
const {
  isAuth0CliInstalled,
  isAuth0LoggedIn,
  getActiveTenantDomain,
  runAuth0Command,
  runAuth0Api,
} = await import('../../src/utils/auth0-cli.js');

describe('configureTokenVault', () => {
  let stdinData: string;
  let originalStdin: typeof process.stdin;

  beforeEach(() => {
    stdinData = '';
    vi.mocked(isAuth0CliInstalled).mockResolvedValue(true);
    vi.mocked(isAuth0LoggedIn).mockResolvedValue(true);
    vi.mocked(getActiveTenantDomain).mockResolvedValue('test.auth0.com');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when auth0 CLI is not installed', async () => {
    vi.mocked(isAuth0CliInstalled).mockResolvedValue(false);

    const { configureTokenVault } =
      await import('../../src/commands/init/configure-token-vault.js');

    await expect(configureTokenVault({ callbackUrls: [], logoutUrls: [] })).rejects.toThrow(
      'Auth0 CLI is not installed'
    );
  });
});
