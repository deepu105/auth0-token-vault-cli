import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { log } from '../utils/logger.js';
import { resolveStorageBackend } from '../utils/config.js';
import type { Auth0Tokens, ConnectionToken, CredentialData } from './types.js';
import type { CredentialBackend } from './backend.js';
import { KeyringBackend } from './keyring-backend.js';

const DEFAULT_DIR = join(homedir(), '.auth0-tv');
const CREDENTIALS_FILE = 'credentials.json';

/** Proactive expiry buffer — treat tokens as expired 5 minutes early */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// ── FileBackend ──────────────────────────────────────────────────

export class FileBackend implements CredentialBackend {
  private readonly dir: string;
  private readonly filePath: string;

  constructor(dir: string) {
    this.dir = dir;
    this.filePath = join(this.dir, CREDENTIALS_FILE);
  }

  async getAuth0Tokens(): Promise<Auth0Tokens | null> {
    const data = await this.load();
    return data.auth0 ?? null;
  }

  async saveAuth0Tokens(tokens: Auth0Tokens): Promise<void> {
    const data = await this.load();
    data.auth0 = tokens;
    await this.persist(data);
  }

  async getConnectionToken(connection: string): Promise<ConnectionToken | null> {
    const data = await this.load();
    return data.connections[connection] ?? null;
  }

  async saveConnectionToken(connection: string, token: ConnectionToken): Promise<void> {
    const data = await this.load();
    data.connections[connection] = token;
    await this.persist(data);
  }

  async listConnections(): Promise<string[]> {
    const data = await this.load();
    return Object.keys(data.connections);
  }

  async removeConnection(connection: string): Promise<boolean> {
    const data = await this.load();
    if (!(connection in data.connections)) return false;
    delete data.connections[connection];
    await this.persist(data);
    return true;
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
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
      log('credential file unreadable, starting fresh');
      return { connections: {} };
    }
  }

  private async persist(data: CredentialData): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }
}

// ── CredentialStore (facade) ─────────────────────────────────────

export class CredentialStore {
  private readonly backend: CredentialBackend;

  constructor(dir?: string);
  constructor(backend: CredentialBackend);
  constructor(dirOrBackend?: string | CredentialBackend) {
    if (dirOrBackend !== undefined && typeof dirOrBackend !== 'string') {
      this.backend = dirOrBackend;
    } else if (typeof dirOrBackend === 'string') {
      // Explicit dir means file backend (used in tests)
      this.backend = new FileBackend(dirOrBackend);
    } else {
      // No argument — resolve from config/env
      const storage = resolveStorageBackend();
      if (storage === 'keyring') {
        this.backend = new KeyringBackend();
      } else {
        this.backend = new FileBackend(DEFAULT_DIR);
      }
    }
  }

  // ── Read ──────────────────────────────────────────────────────

  async getAuth0Token(): Promise<string | null> {
    const tokens = await this.backend.getAuth0Tokens();
    if (!tokens) return null;
    if (this.isExpired(tokens.expiresAt)) {
      log('auth0 access token expired');
      return null;
    }
    return tokens.accessToken;
  }

  async getAuth0Tokens(): Promise<Auth0Tokens | null> {
    return this.backend.getAuth0Tokens();
  }

  async getConnectionToken(connection: string): Promise<string | null> {
    const entry = await this.backend.getConnectionToken(connection);
    if (!entry) return null;
    if (this.isExpired(entry.expiresAt)) {
      log('connection token for %s expired', connection);
      return null;
    }
    return entry.accessToken;
  }

  async getConnectionEntry(connection: string): Promise<ConnectionToken | null> {
    return this.backend.getConnectionToken(connection);
  }

  async listConnections(): Promise<string[]> {
    return this.backend.listConnections();
  }

  // ── Write ─────────────────────────────────────────────────────

  async saveAuth0Tokens(tokens: Auth0Tokens): Promise<void> {
    await this.backend.saveAuth0Tokens(tokens);
    log('auth0 tokens saved');
  }

  async saveConnectionToken(connection: string, token: ConnectionToken): Promise<void> {
    await this.backend.saveConnectionToken(connection, token);
    log('connection token saved for %s', connection);
  }

  async removeConnection(connection: string): Promise<boolean> {
    const removed = await this.backend.removeConnection(connection);
    if (removed) log('connection removed: %s', connection);
    return removed;
  }

  async clear(): Promise<void> {
    await this.backend.clear();
    log('credentials cleared');
  }

  // ── Internals ─────────────────────────────────────────────────

  private isExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
  }
}
