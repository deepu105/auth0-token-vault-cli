/** Parse optional `--port` CLI flag for callback/logout redirect server binding. */
export function parseCallbackPort(rawValue: string | undefined): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid --port value "${rawValue}". Expected an integer between 1 and 65535.`);
  }

  const port = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port value "${rawValue}". Expected an integer between 1 and 65535.`);
  }

  return port;
}
