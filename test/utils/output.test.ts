import { describe, it, expect, afterEach } from 'vitest';
import { Command } from 'commander';
import { output, outputError } from '../../src/utils/output.js';

/**
 * Create a minimal Commander program with optional --json flag.
 */
function makeCmd(jsonFlag = false): Command {
  const program = new Command();
  if (jsonFlag) program.opts().json = true;
  const sub = program.command('test');
  return sub;
}

// ── AUTH0_TV_OUTPUT env var ──────────────────────────────────

describe('AUTH0_TV_OUTPUT env var', () => {
  const originalEnv = process.env.AUTH0_TV_OUTPUT;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AUTH0_TV_OUTPUT;
    else process.env.AUTH0_TV_OUTPUT = originalEnv;
  });

  it('produces JSON output when AUTH0_TV_OUTPUT=json without --json flag', () => {
    process.env.AUTH0_TV_OUTPUT = 'json';
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      output({ status: 'ok' }, 'Status: ok', makeCmd(false));
    } finally {
      process.stdout.write = origWrite;
    }

    expect(chunks.join('')).toContain('"status": "ok"');
  });

  it('--json flag works regardless of env var', () => {
    delete process.env.AUTH0_TV_OUTPUT;
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      output({ status: 'ok' }, 'Status: ok', makeCmd(true));
    } finally {
      process.stdout.write = origWrite;
    }

    expect(chunks.join('')).toContain('"status": "ok"');
  });

  it('invalid AUTH0_TV_OUTPUT value falls back to human mode', () => {
    process.env.AUTH0_TV_OUTPUT = 'xml';
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      output({ status: 'ok' }, 'Status: ok', makeCmd(false));
    } finally {
      process.stdout.write = origWrite;
    }

    expect(chunks.join('')).toBe('Status: ok\n');
  });

  it('no env var and no flag produces human output', () => {
    delete process.env.AUTH0_TV_OUTPUT;
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      output({ status: 'ok' }, 'Status: ok', makeCmd(false));
    } finally {
      process.stdout.write = origWrite;
    }

    expect(chunks.join('')).toBe('Status: ok\n');
  });

  it('env var affects outputError as well', () => {
    process.env.AUTH0_TV_OUTPUT = 'json';
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      chunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      outputError({ code: 'test_error', message: 'Something failed' }, makeCmd(false));
    } finally {
      process.stdout.write = origWrite;
    }

    const out = chunks.join('');
    expect(out).toContain('"code": "test_error"');
    expect(out).toContain('"message": "Something failed"');
  });
});
