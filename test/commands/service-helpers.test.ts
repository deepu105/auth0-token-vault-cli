import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers.js';
import {
  createServiceClient,
  handleServiceError,
  withServiceAction,
} from '../../src/commands/service-helpers.js';
import { classifyGoogleError } from '../../src/utils/classify-google-error.js';
import { classifyGitHubError } from '../../src/commands/github/helpers.js';
import { classifySlackError } from '../../src/commands/slack/helpers.js';
import { TokenExchangeError } from '../../src/auth/token-exchange.js';
import {
  EXIT_AUTH_REQUIRED,
  EXIT_AUTHZ_REQUIRED,
  EXIT_INVALID_INPUT,
  EXIT_SERVICE_ERROR,
  EXIT_NETWORK_ERROR,
} from '../../src/utils/exit-codes.js';
import { clearOidcConfigCache } from '../../src/auth/oidc-config.js';

/* ------------------------------------------------------------------ */
/*  createServiceClient                                               */
/* ------------------------------------------------------------------ */

describe('createServiceClient', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  it('creates a client instance with the correct constructor', async () => {
    class FakeClient {
      constructor(public tokenGetter: () => Promise<string>) {}
    }

    const cmd = new Command();
    const client = await createServiceClient(FakeClient, 'gmail', cmd);
    expect(client).toBeInstanceOf(FakeClient);
    expect(typeof client.tokenGetter).toBe('function');
  });

  it('throws for unknown service names', async () => {
    class FakeClient {
      constructor(public tokenGetter: () => Promise<string>) {}
    }

    const cmd = new Command();
    await expect(createServiceClient(FakeClient, 'nonexistent', cmd)).rejects.toThrow(
      'Unknown service: nonexistent'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  handleServiceError                                                */
/* ------------------------------------------------------------------ */

describe('handleServiceError', () => {
  const cmd = new Command().option('--json');

  it('maps TokenExchangeError to its exit code', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleServiceError(new TokenExchangeError('test', EXIT_AUTH_REQUIRED), cmd, 'gmail');
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_AUTH_REQUIRED);
    mockExit.mockRestore();
  });

  it('maps ECONNREFUSED to EXIT_NETWORK_ERROR', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleServiceError(new Error('ECONNREFUSED'), cmd, 'gmail');
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_NETWORK_ERROR);
    mockExit.mockRestore();
  });

  it('maps fetch failed to EXIT_NETWORK_ERROR', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleServiceError(new Error('fetch failed'), cmd, 'slack');
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_NETWORK_ERROR);
    mockExit.mockRestore();
  });

  it('delegates to classifier when provided', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleServiceError(
        Object.assign(new Error('Unauthorized'), { status: 401 }),
        cmd,
        'github',
        classifyGitHubError
      );
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_AUTH_REQUIRED);
    mockExit.mockRestore();
  });

  it('falls through to EXIT_SERVICE_ERROR for unknown errors', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      handleServiceError(new Error('Something went wrong'), cmd, 'gmail');
    } catch {
      /* process.exit mocked */
    }
    expect(mockExit).toHaveBeenCalledWith(EXIT_SERVICE_ERROR);
    mockExit.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  classifyGoogleError                                               */
/* ------------------------------------------------------------------ */

describe('classifyGoogleError', () => {
  it('classifies 401 as auth_required', () => {
    const result = classifyGoogleError({ code: 401 }, 'gmail');
    expect(result).toEqual({
      code: 'auth_required',
      message: 'Gmail token expired. Run `auth0-tv connect gmail`.',
      exitCode: EXIT_AUTH_REQUIRED,
    });
  });

  it('classifies status 401 as auth_required', () => {
    const result = classifyGoogleError({ status: 401 }, 'calendar');
    expect(result).toEqual({
      code: 'auth_required',
      message: 'Calendar token expired. Run `auth0-tv connect calendar`.',
      exitCode: EXIT_AUTH_REQUIRED,
    });
  });

  it('classifies 403 as authorization_required', () => {
    const result = classifyGoogleError({ code: 403 }, 'gmail');
    expect(result).toEqual({
      code: 'authorization_required',
      message:
        'Insufficient Gmail scopes. Run `auth0-tv connect gmail` to grant additional permissions.',
      exitCode: EXIT_AUTHZ_REQUIRED,
    });
  });

  it('returns undefined for unrecognised errors', () => {
    expect(classifyGoogleError({ code: 500 }, 'gmail')).toBeUndefined();
    expect(classifyGoogleError(new Error('random'), 'gmail')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  classifySlackError                                                */
/* ------------------------------------------------------------------ */

describe('classifySlackError', () => {
  it('classifies not_authed as auth_required', () => {
    const result = classifySlackError({ data: { error: 'not_authed' } }, 'slack');
    expect(result).toEqual({
      code: 'auth_required',
      message: 'Slack token expired or invalid. Run `auth0-tv connect slack`.',
      exitCode: EXIT_AUTH_REQUIRED,
    });
  });

  it('classifies token_expired as auth_required', () => {
    const result = classifySlackError({ data: { error: 'token_expired' } }, 'slack');
    expect(result?.exitCode).toBe(EXIT_AUTH_REQUIRED);
  });

  it('classifies invalid_auth as auth_required', () => {
    const result = classifySlackError({ data: { error: 'invalid_auth' } }, 'slack');
    expect(result?.exitCode).toBe(EXIT_AUTH_REQUIRED);
  });

  it('classifies token_revoked as auth_required', () => {
    const result = classifySlackError({ data: { error: 'token_revoked' } }, 'slack');
    expect(result?.exitCode).toBe(EXIT_AUTH_REQUIRED);
  });

  it('classifies missing_scope as authorization_required', () => {
    const result = classifySlackError({ data: { error: 'missing_scope' } }, 'slack');
    expect(result).toEqual({
      code: 'authorization_required',
      message:
        'Insufficient Slack scopes. Run `auth0-tv connect slack` to grant additional permissions.',
      exitCode: EXIT_AUTHZ_REQUIRED,
    });
  });

  it('classifies channel_not_found as invalid_input', () => {
    const result = classifySlackError({ data: { error: 'channel_not_found' } }, 'slack');
    expect(result).toEqual({
      code: 'invalid_input',
      message: 'Slack error: channel_not_found',
      exitCode: EXIT_INVALID_INPUT,
    });
  });

  it('classifies not_in_channel as invalid_input', () => {
    const result = classifySlackError({ data: { error: 'not_in_channel' } }, 'slack');
    expect(result?.exitCode).toBe(EXIT_INVALID_INPUT);
  });

  it('classifies is_archived as invalid_input', () => {
    const result = classifySlackError({ data: { error: 'is_archived' } }, 'slack');
    expect(result?.exitCode).toBe(EXIT_INVALID_INPUT);
  });

  it('extracts error code from message string', () => {
    const err = new Error('An API error occurred: not_authed');
    const result = classifySlackError(err, 'slack');
    expect(result?.exitCode).toBe(EXIT_AUTH_REQUIRED);
  });

  it('returns undefined for unrecognised Slack errors', () => {
    expect(classifySlackError({ data: { error: 'unknown_thing' } }, 'slack')).toBeUndefined();
  });

  it('returns undefined when no Slack error is present', () => {
    expect(classifySlackError(new Error('random'), 'slack')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  classifyGitHubError                                               */
/* ------------------------------------------------------------------ */

describe('classifyGitHubError', () => {
  it('classifies 401 as auth_required', () => {
    const result = classifyGitHubError(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
      'github'
    );
    expect(result).toEqual({
      code: 'auth_required',
      message: 'Github token expired. Run `auth0-tv connect github`.',
      exitCode: EXIT_AUTH_REQUIRED,
    });
  });

  it('classifies 403 as authorization_required', () => {
    const result = classifyGitHubError(
      Object.assign(new Error('Forbidden'), { status: 403 }),
      'github'
    );
    expect(result).toEqual({
      code: 'authorization_required',
      message:
        'Insufficient Github scopes. Run `auth0-tv connect github` to grant additional permissions.',
      exitCode: EXIT_AUTHZ_REQUIRED,
    });
  });

  it('classifies 404 as not_found with EXIT_SERVICE_ERROR', () => {
    const result = classifyGitHubError(
      Object.assign(new Error('Not Found'), { status: 404 }),
      'github'
    );
    expect(result).toEqual({
      code: 'not_found',
      message: 'Not Found',
      exitCode: EXIT_SERVICE_ERROR,
    });
  });

  it('returns undefined for unrecognised status codes', () => {
    expect(
      classifyGitHubError(Object.assign(new Error('Server Error'), { status: 500 }), 'github')
    ).toBeUndefined();
  });

  it('returns undefined when no status is present', () => {
    expect(classifyGitHubError(new Error('random'), 'github')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  withServiceAction                                                  */
/* ------------------------------------------------------------------ */

describe('withServiceAction', () => {
  const msw = setupServer(...handlers);

  beforeAll(() => msw.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => msw.close());
  afterEach(() => {
    msw.resetHandlers();
    clearOidcConfigCache();
  });

  class MockClient {
    constructor(public tokenGetter: () => Promise<string>) {}
  }

  it('calls action with a valid client instance', async () => {
    const actionFn = vi.fn(async () => {});
    const wrapped = withServiceAction('gmail', MockClient, undefined, actionFn);

    const cmd = new Command();
    const opts = { foo: 'bar' };
    await wrapped(opts, cmd);

    expect(actionFn).toHaveBeenCalledOnce();
    const [client] = actionFn.mock.calls[0];
    expect(client).toBeInstanceOf(MockClient);
    expect(typeof client.tokenGetter).toBe('function');
  });

  it('passes opts and cmd correctly to the action callback', async () => {
    const actionFn = vi.fn(async () => {});
    const wrapped = withServiceAction('gmail', MockClient, undefined, actionFn);

    const cmd = new Command();
    const opts = { query: 'test', limit: 10 };
    await wrapped(opts, cmd);

    expect(actionFn).toHaveBeenCalledOnce();
    const [, receivedOpts, receivedCmd] = actionFn.mock.calls[0];
    expect(receivedOpts).toBe(opts);
    expect(receivedCmd).toBe(cmd);
  });

  it('catches errors and delegates to handleServiceError', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const actionFn = vi.fn(async () => {
      throw new Error('Something broke');
    });
    const wrapped = withServiceAction('gmail', MockClient, undefined, actionFn);

    const cmd = new Command();
    await wrapped({}, cmd);

    expect(mockExit).toHaveBeenCalledWith(EXIT_SERVICE_ERROR);
    mockExit.mockRestore();
  });

  it('passes classifier to handleServiceError on failure', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const actionFn = vi.fn(async () => {
      throw Object.assign(new Error('Unauthorized'), { code: 401 });
    });
    const wrapped = withServiceAction('gmail', MockClient, classifyGoogleError, actionFn);

    const cmd = new Command();
    await wrapped({}, cmd);

    expect(mockExit).toHaveBeenCalledWith(EXIT_AUTH_REQUIRED);
    mockExit.mockRestore();
  });
});
