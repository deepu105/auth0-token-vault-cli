import debug from 'debug';

export const log = debug('auth0-tv');

// Ensure all debug output goes to stderr so --json stdout stays clean
debug.log = (...args) => {
  const msg = `[DEBUG:auth0-tv] ${args.join(' ')}\n`;
  process.stderr.write(msg);
  return true;
};

export const logError = (msg: string, error?: unknown) => {
  const formatted = `[ERROR:auth0-tv] ${msg}`;
  if (error) {
    console.error(formatted, error);
  } else {
    console.error(formatted);
  }
};
