import type { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { outputError } from '../utils/output.js';
import { EXIT_INVALID_INPUT } from '../utils/exit-codes.js';

/** Check --confirm/--yes flag. For destructive actions in non-TTY mode. */
function isConfirmed(cmd: Command): boolean {
  let root = cmd;
  while (root.parent) root = root.parent;
  const opts = root.opts();
  return opts.confirm === true || opts.yes === true;
}

/**
 * Require confirmation for destructive actions.
 * - If --confirm/--yes is set, proceed.
 * - If TTY, prompt interactively.
 * - If no TTY and no flag, exit with code 2.
 */
export async function requireConfirmation(action: string, cmd: Command): Promise<void> {
  if (isConfirmed(cmd)) return;

  if (!process.stdin.isTTY) {
    outputError(
      {
        code: 'confirmation_required',
        message: `Destructive action "${action}" requires --confirm or --yes flag in non-interactive mode.`,
      },
      cmd
    );
    process.exit(EXIT_INVALID_INPUT);
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(`${action} — are you sure? (y/N) `);
  rl.close();

  if (answer.toLowerCase() !== 'y') {
    process.stderr.write('Cancelled.\n');
    process.exit(0);
  }
}

/**
 * Resolve message body from --body, --body-file, or stdin.
 */
export async function resolveBody(opts: {
  body?: string;
  bodyFile?: string;
}): Promise<string | null> {
  if (opts.body) return opts.body;

  if (opts.bodyFile) {
    // Resolve to absolute and follow symlinks via realpath(), then verify the
    // real path stays under cwd. realpath() resolves symlinks to their target,
    // so a symlink inside cwd pointing outside will resolve to the external path
    // and be correctly rejected by the startsWith check below.
    const cwd = process.cwd();
    const resolved = await realpath(resolve(cwd, opts.bodyFile));
    if (!resolved.startsWith(`${cwd}/`) && resolved !== cwd) {
      throw new Error(
        `--body-file path must be within the working directory. Resolved to: ${resolved}`
      );
    }
    return readFile(resolved, 'utf-8');
  }

  // Read from stdin if piped
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf-8').trim();
    if (text) return text;
  }

  return null;
}
