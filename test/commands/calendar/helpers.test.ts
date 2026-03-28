import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

describe('handleCalendarError', () => {
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
    const { handleCalendarError } = await import('../../../src/commands/calendar/helpers.js');
    handleCalendarError(new Error('fetch failed'), cmd);
    expect(exitSpy).toHaveBeenCalledWith(6);
  });

  it('maps 401 errors to EXIT_AUTH_REQUIRED (3)', async () => {
    const { handleCalendarError } = await import('../../../src/commands/calendar/helpers.js');
    const err = new Error('Unauthorized');
    (err as any).code = 401;
    handleCalendarError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('maps 403 errors to EXIT_AUTHZ_REQUIRED (4)', async () => {
    const { handleCalendarError } = await import('../../../src/commands/calendar/helpers.js');
    const err = new Error('Forbidden');
    (err as any).code = 403;
    handleCalendarError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  it('maps unknown errors to EXIT_SERVICE_ERROR (5)', async () => {
    const { handleCalendarError } = await import('../../../src/commands/calendar/helpers.js');
    handleCalendarError(new Error('something unexpected'), cmd);
    expect(exitSpy).toHaveBeenCalledWith(5);
  });
});
