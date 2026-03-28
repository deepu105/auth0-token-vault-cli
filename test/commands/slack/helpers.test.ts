import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

describe('handleSlackError', () => {
  let cmd: Command;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const program = new Command();
    program.option('--json');
    cmd = program.command('test-cmd');

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps network errors to EXIT_NETWORK_ERROR (6)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    handleSlackError(new Error('fetch failed'), cmd);
    expect(exitSpy).toHaveBeenCalledWith(6);
  });

  it('maps ECONNREFUSED to EXIT_NETWORK_ERROR (6)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    handleSlackError(new Error('connect ECONNREFUSED'), cmd);
    expect(exitSpy).toHaveBeenCalledWith(6);
  });

  it('maps not_authed to EXIT_AUTH_REQUIRED (3)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: not_authed');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('maps invalid_auth to EXIT_AUTH_REQUIRED (3)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: invalid_auth');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('maps token_expired to EXIT_AUTH_REQUIRED (3)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: token_expired');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('maps token_revoked to EXIT_AUTH_REQUIRED (3)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: token_revoked');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('maps missing_scope to EXIT_AUTHZ_REQUIRED (4)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: missing_scope');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  it('maps channel_not_found to EXIT_INVALID_INPUT (2)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: channel_not_found');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('maps not_in_channel to EXIT_INVALID_INPUT (2)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: not_in_channel');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('maps is_archived to EXIT_INVALID_INPUT (2)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('An API error occurred: is_archived');
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('maps Slack error via data.error property to EXIT_AUTH_REQUIRED (3)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    const err = new Error('Slack API error');
    (err as any).data = { error: 'not_authed' };
    handleSlackError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('maps unknown errors to EXIT_SERVICE_ERROR (5)', async () => {
    const { handleSlackError } = await import('../../../src/commands/slack/helpers.js');
    handleSlackError(new Error('something unexpected'), cmd);
    expect(exitSpy).toHaveBeenCalledWith(5);
  });
});
