import type { Command } from 'commander';
import * as p from '@clack/prompts';
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

  const confirmed = await p.confirm({
    message: `${action} — are you sure?`,
    initialValue: false,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Cancelled.');
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
    // realpath() the cwd so prefix comparisons work on platforms where cwd
    // contains symlinks (e.g. /var → /private/var on macOS).
    const cwd = await realpath(process.cwd());
    const absolute = resolve(cwd, opts.bodyFile);

    // Syntactic check first — rejects `..` traversal even if the target
    // doesn't exist, so realpath() isn't called on paths outside cwd.
    if (!absolute.startsWith(`${cwd}/`) && absolute !== cwd) {
      throw new Error(
        `--body-file path must be within the working directory. Resolved to: ${absolute}`
      );
    }

    // Then follow symlinks and re-check, so a symlink inside cwd pointing
    // outside is rejected too.
    const resolved = await realpath(absolute);
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
