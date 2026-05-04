import type { Command } from 'commander';

/**
 * Resolve JSON output mode. Precedence:
 *  1. --json CLI flag
 *  2. AUTH0_TV_OUTPUT=json env var
 */
export function isJsonMode(cmd: Command): boolean {
  // Walk up to the root program to read global opts
  let root = cmd;
  while (root.parent) {
    root = root.parent;
  }
  return root.opts().json === true || process.env.AUTH0_TV_OUTPUT === 'json';
}

/**
 * Print command output. When --json is active, writes structured JSON to
 * stdout. Otherwise prints the human-friendly string.
 */
export function output(data: Record<string, unknown>, humanText: string, cmd: Command): void {
  if (isJsonMode(cmd)) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(`${humanText}\n`);
  }
}

/**
 * Print an error. In --json mode writes `{ "error": ... }` to stdout so
 * agents can parse it; otherwise writes human text to stderr.
 */
export function outputError(
  error: { code: string; message: string; details?: unknown },
  cmd: Command
): void {
  if (isJsonMode(cmd)) {
    process.stdout.write(`${JSON.stringify({ error }, null, 2)}\n`);
  } else {
    process.stderr.write(`Error: ${error.message}\n`);
  }
}
