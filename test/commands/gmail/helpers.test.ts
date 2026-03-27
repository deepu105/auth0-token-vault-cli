import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';
import { resolveBody } from '../../../src/commands/gmail/helpers.js';

describe('resolveBody', () => {
  let tempDir: string;
  let originalCwd: typeof process.cwd;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'resolve-body-'));
    originalCwd = process.cwd;
    process.cwd = () => tempDir;
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns --body string directly', async () => {
    const result = await resolveBody({ body: 'hello world' });
    expect(result).toBe('hello world');
  });

  it('returns null when no body source provided and stdin is TTY', async () => {
    const original = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    try {
      const result = await resolveBody({});
      expect(result).toBeNull();
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
    }
  });

  it('reads --body-file from within cwd', async () => {
    const filePath = join(tempDir, 'message.txt');
    await writeFile(filePath, 'file body content');

    const result = await resolveBody({ bodyFile: 'message.txt' });
    expect(result).toBe('file body content');
  });

  it('rejects --body-file with path traversal', async () => {
    await expect(resolveBody({ bodyFile: '../../etc/passwd' })).rejects.toThrow(
      '--body-file path must be within the working directory'
    );
  });

  it('prefers --body over --body-file', async () => {
    const filePath = join(tempDir, 'ignored.txt');
    await writeFile(filePath, 'from file');

    const result = await resolveBody({ body: 'from flag', bodyFile: 'ignored.txt' });
    expect(result).toBe('from flag');
  });
});

describe('handleGmailError', () => {
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
    const { handleGmailError } = await import('../../../src/commands/gmail/helpers.js');
    handleGmailError(new Error('fetch failed'), cmd);
    expect(exitSpy).toHaveBeenCalledWith(6);
  });

  it('maps 401 errors to EXIT_AUTH_REQUIRED (3)', async () => {
    const { handleGmailError } = await import('../../../src/commands/gmail/helpers.js');
    const err = new Error('Unauthorized');
    (err as any).code = 401;
    handleGmailError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it('maps 403 errors to EXIT_AUTHZ_REQUIRED (4)', async () => {
    const { handleGmailError } = await import('../../../src/commands/gmail/helpers.js');
    const err = new Error('Forbidden');
    (err as any).code = 403;
    handleGmailError(err, cmd);
    expect(exitSpy).toHaveBeenCalledWith(4);
  });

  it('maps unknown errors to EXIT_SERVICE_ERROR (5)', async () => {
    const { handleGmailError } = await import('../../../src/commands/gmail/helpers.js');
    handleGmailError(new Error('something unexpected'), cmd);
    expect(exitSpy).toHaveBeenCalledWith(5);
  });
});

describe('requireConfirmation', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('proceeds immediately when --confirm flag is set', async () => {
    const { requireConfirmation } = await import('../../../src/commands/gmail/helpers.js');
    const program = new Command();
    program.option('--confirm');
    program.parse(['node', 'test', '--confirm']);
    const cmd = program;

    await requireConfirmation('Delete message', cmd);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('proceeds immediately when --yes flag is set', async () => {
    const { requireConfirmation } = await import('../../../src/commands/gmail/helpers.js');
    const program = new Command();
    program.option('--yes');
    program.parse(['node', 'test', '--yes']);
    const cmd = program;

    await requireConfirmation('Delete message', cmd);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits with code 2 in non-TTY without --confirm', async () => {
    const { requireConfirmation } = await import('../../../src/commands/gmail/helpers.js');
    const original = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    // Make exit throw to stop execution (otherwise it falls through to stdin)
    exitSpy.mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any);
    try {
      const program = new Command();
      program.option('--confirm');
      program.option('--yes');
      program.parse(['node', 'test']);
      const cmd = program;

      await expect(requireConfirmation('Delete message', cmd)).rejects.toThrow('process.exit(2)');
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true });
    }
  });
});
