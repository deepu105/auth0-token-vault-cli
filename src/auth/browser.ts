import { createServer, type Server } from 'node:http';
import open from 'open';
import { log } from '../utils/logger.js';

export const CALLBACK_PORTS = [18484, 18485, 18486, 18487, 18488, 18489];

/** Try to bind a server to the first available port in the range */
export async function bindServer(server: Server): Promise<number> {
  for (const port of CALLBACK_PORTS) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      return port;
    } catch {
      log('port %d unavailable, trying next', port);
    }
  }
  throw new Error(
    `Could not bind callback server to any port in range ${CALLBACK_PORTS[0]}-${CALLBACK_PORTS[CALLBACK_PORTS.length - 1]}`
  );
}

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Generate a simple HTML page with a title, message, and auto-close script */
export function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><title>Auth0 Token Vault CLI</title></head>
<body style="font-family:system-ui;text-align:center;padding:2em">
<h2>${escapeHtml(title)}</h2>
<p>${escapeHtml(message)}</p>
<script>window.close()</script>
</body></html>`;
}

/**
 * Open the Auth0 /v2/logout endpoint in the browser with a local returnTo
 * callback that shows a "Logged out" page. Best-effort — failures are logged
 * but do not throw.
 */
export async function openBrowserLogout(domain: string, clientId: string, browser?: string): Promise<void> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(htmlPage('Logged out', 'You can close this tab and return to the terminal.'));
    server.close();
  });

  const port = await bindServer(server);
  const returnTo = encodeURIComponent(`http://127.0.0.1:${port}`);
  const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`;
  log('opening browser to %s', logoutUrl);
  await open(logoutUrl, browser ? { app: { name: browser } } : undefined);

  // Auto-close if browser never hits the callback
  setTimeout(() => server.close(), 10_000).unref();
}
