import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { log } from '../utils/logger.js';
import type { Auth0Tokens, ConnectionToken, CredentialData } from './types.js';

const DEFAULT_DIR = join(homedir(), '.auth0-tv');
const CREDENTIALS_FILE = 'credentials.json';

/** Proactive expiry buffer — treat tokens as expired 5 minutes early */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export class CredentialStore {
  private readonly dir: string;
  private readonly filePath: string;

  constructor(dir?: string) {
    this.dir = dir ?? DEFAULT_DIR;
    this.filePath = join(this.dir, CREDENTIALS_FILE);
  }

  // ── Read ──────────────────────────────────────────────────────

  async getAuth0Token(): Promise<string | null> {
    const data = await this.load();
    if (!data.auth0) return null;
    if (this.isExpired(data.auth0.expiresAt)) {
      log('auth0 access token expired');
      return null;
    }
    return data.auth0.accessToken;
  }

  async getAuth0Tokens(): Promise<Auth0Tokens | null> {
    const data = await this.load();
    return data.auth0 ?? null;
  }

  async getConnectionToken(connection: string): Promise<string | null> {
    const data = await this.load();
    const entry = data.connections[connection];
    if (!entry) return null;
    if (this.isExpired(entry.expiresAt)) {
      log('connection token for %s expired', connection);
      return null;
    }
    return entry.accessToken;
  }

  async getConnectionEntry(connection: string): Promise<ConnectionToken | null> {
    const data = await this.load();
    return data.connections[connection] ?? null;
  }

  async listConnections(): Promise<string[]> {
    const data = await this.load();
    return Object.keys(data.connections);
  }

  // ── Write ─────────────────────────────────────────────────────

  async saveAuth0Tokens(tokens: Auth0Tokens): Promise<void> {
    const data = await this.load();
    data.auth0 = tokens;
    await this.persist(data);
    log('auth0 tokens saved');
  }

  async saveConnectionToken(connection: string, token: ConnectionToken): Promise<void> {
    const data = await this.load();
    data.connections[connection] = token;
    await this.persist(data);
    log('connection token saved for %s', connection);
  }

  async removeConnection(connection: string): Promise<boolean> {
    const data = await this.load();
    if (!(connection in data.connections)) return false;
    delete data.connections[connection];
    await this.persist(data);
    log('connection removed: %s', connection);
    return true;
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
      log('credentials cleared');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  // ── Internals ─────────────────────────────────────────────────

  private isExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
  }

  private async load(): Promise<CredentialData> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as CredentialData;
      return { ...parsed, connections: parsed.connections ?? {} };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { connections: {} };
      }
      // Corrupt file — start fresh
      log('credential file unreadable, starting fresh');
      return { connections: {} };
    }
  }

  private async persist(data: CredentialData): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }
}
