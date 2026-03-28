import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupServer } from 'msw/node';
import { handlers } from '../../mocks/handlers.js';
import { handleGitHubError, parseOwnerRepo } from '../../../src/commands/github/helpers.js';
import { TokenExchangeError } from '../../../src/auth/token-exchange.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_SERVICE_ERROR,
  EXIT_NETWORK_ERROR,
} from '../../../src/utils/exit-codes.js';
import { clearOidcConfigCache } from '../../../src/auth/oidc-config.js';

describe('parseOwnerRepo', () => {
  it('parses valid owner/repo string', () => {
    expect(parseOwnerRepo('user/repo')).toEqual({ owner: 'user', repo: 'repo' });
    expect(parseOwnerRepo('org/my-project')).toEqual({ owner: 'org', repo: 'my-project' });
  });

  it('returns undefined for invalid formats', () => {
    expect(parseOwnerRepo('noslash')).toBeUndefined();
    expect(parseOwnerRepo('too/many/slashes')).toBeUndefined();
    expect(parseOwnerRepo('/repo')).toBeUndefined();
    expect(parseOwnerRepo('owner/')).toBeUndefined();
    expect(parseOwnerRepo('')).toBeUndefined();
  });
});

describe('handleGitHubError', () => {
  const msw = setupServer(...handlers);
  const cmd = new Command().option('--json');

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('maps TokenExchangeError to its exit code', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleGitHubError(new TokenExchangeError('test', EXIT_AUTH_REQUIRED), cmd);
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_AUTH_REQUIRED);
    mockExit.mockRestore();
  });

  it('maps 401 status to EXIT_AUTH_REQUIRED', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleGitHubError(Object.assign(new Error('Unauthorized'), { status: 401 }), cmd);
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_AUTH_REQUIRED);
    mockExit.mockRestore();
  });

  it('maps 403 status to EXIT_AUTHZ_REQUIRED', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleGitHubError(Object.assign(new Error('Forbidden'), { status: 403 }), cmd);
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_AUTHZ_REQUIRED);
    mockExit.mockRestore();
  });

  it('maps 404 status to EXIT_SERVICE_ERROR', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleGitHubError(Object.assign(new Error('Not Found'), { status: 404 }), cmd);
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_SERVICE_ERROR);
    mockExit.mockRestore();
  });

  it('maps network errors to EXIT_NETWORK_ERROR', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleGitHubError(new Error('ECONNREFUSED'), cmd);
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_NETWORK_ERROR);
    mockExit.mockRestore();
  });

  it('maps unknown errors to EXIT_SERVICE_ERROR', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleGitHubError(new Error('Something went wrong'), cmd);
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_SERVICE_ERROR);
    mockExit.mockRestore();
  });
});
