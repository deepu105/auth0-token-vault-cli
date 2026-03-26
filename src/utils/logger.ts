import { format } from 'node:util';
import debug from 'debug';

export const log = debug('auth0-tv');

// Ensure all debug output goes to stderr so --json stdout stays clean
debug.log = (...args: unknown[]) => {
  process.stderr.write(`[DEBUG:auth0-tv] ${format(...args)}\n`);
};

export const logError = (msg: string, error?: unknown) => {
  const formatted = `[ERROR:auth0-tv] ${msg}`;
  if (error) {
    console.error(formatted, error);
  } else {
    console.error(formatted);
  }
};
