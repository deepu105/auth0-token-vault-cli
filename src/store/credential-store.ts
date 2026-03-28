import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { log } from '../utils/logger.js';
import { resolveStorageBackend, type Auth0Config } from '../utils/config.js';
import type {
  Auth0Tokens,
  ConnectionToken,
  CredentialData,
  ServiceSettings,
  StoredConfig,
} from './types.js';
import { refreshAuth0Token } from '../auth/token-refresh.js';
import type { CredentialBackend } from './backend.js';

const DEFAULT_DIR = join(homedir(), '.auth0-tv');
const CREDENTIALS_FILE = 'credentials.json';

function resolveFileBackendDir(): string {
  return process.env.AUTH0_TV_CONFIG_DIR || DEFAULT_DIR;
}

/** Proactive expiry buffer — treat tokens as expired 2 minutes early */
export const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

// ── FileBackend ──────────────────────────────────────────────────

export class FileBackend implements CredentialBackend {
  private readonly dir: string;
  private readonly filePath: string;

  constructor(dir: string) {
    this.dir = dir;
    this.filePath = join(this.dir, CREDENTIALS_FILE);
  }

  async getConfig(): Promise<StoredConfig | null> {
    const data = await this.load();
    return data.config ?? null;
  }

  async saveConfig(config: StoredConfig): Promise<void> {
    const data = await this.load();
    data.config = config;
    await this.persist(data);
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

  async getServiceSettings(service: string): Promise<ServiceSettings | null> {
    const data = await this.load();
    return data.serviceSettings?.[service] ?? null;
  }

  async saveServiceSettings(service: string, settings: ServiceSettings): Promise<void> {
    const data = await this.load();
    if (!data.serviceSettings) data.serviceSettings = {};
    data.serviceSettings[service] = settings;
    await this.persist(data);
  }

  async clear(): Promise<void> {
    const data = await this.load();
    if (data.config || data.serviceSettings) {
      // Preserve config and service settings, wipe tokens and connections
      await this.persist({
        ...(data.config ? { config: data.config } : {}),
        connections: {},
        ...(data.serviceSettings ? { serviceSettings: data.serviceSettings } : {}),
      });
    } else {
      try {
        await unlink(this.filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
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
      throw err;
    }
  }

  private async persist(data: CredentialData): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }
}

// ── CredentialStore (facade) ─────────────────────────────────────

export class CredentialStore {
  private backend: CredentialBackend | undefined;
  private readonly backendLoader: (() => Promise<CredentialBackend>) | undefined;
  private backendPromise: Promise<CredentialBackend> | undefined;

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
        this.backendLoader = async () => {
          // lazy load to avoid importing keytar in environments where it's not supported
          const { KeyringBackend } = await import('./keyring-backend.js');
          return new KeyringBackend();
        };
      } else {
        this.backend = new FileBackend(resolveFileBackendDir());
      }
    }
  }

  // ── Config ─────────────────────────────────────────────────────

  async getConfig(): Promise<StoredConfig | null> {
    const backend = await this.getBackend();
    return backend.getConfig();
  }

  async saveConfig(config: StoredConfig): Promise<void> {
    const backend = await this.getBackend();
    await backend.saveConfig(config);
    log('auth0 config saved');
  }

  // ── Read ──────────────────────────────────────────────────────

  async getAuth0Token(config?: Auth0Config): Promise<string | null> {
    const backend = await this.getBackend();
    const tokens = await backend.getAuth0Tokens();
    if (!tokens) return null;
    if (this.isExpired(tokens.expiresAt)) {
      log('auth0 access token expired');
      if (config && tokens.refreshToken) {
        return this.refreshAndSave(config, tokens.refreshToken);
      }
      return null;
    }
    return tokens.accessToken;
  }

  /**
   * Refresh the Auth0 access token using the stored refresh token,
   * persist the new tokens, and return the new access token.
   * Returns null if the refresh fails (caller should prompt re-login).
   */
  private async refreshAndSave(config: Auth0Config, refreshToken: string): Promise<string | null> {
    try {
      const newTokens = await refreshAuth0Token(config, refreshToken);
      await this.saveAuth0Tokens(newTokens);
      return newTokens.accessToken;
    } catch (err) {
      log('auto-refresh failed: %s', err instanceof Error ? err.message : err);
      return null;
    }
  }

  async getAuth0Tokens(): Promise<Auth0Tokens | null> {
    const backend = await this.getBackend();
    return backend.getAuth0Tokens();
  }

  async getConnectionToken(connection: string): Promise<string | null> {
    const backend = await this.getBackend();
    const entry = await backend.getConnectionToken(connection);
    if (!entry) return null;
    if (this.isExpired(entry.expiresAt)) {
      log('connection token for %s expired', connection);
      return null;
    }
    return entry.accessToken;
  }

  async getConnectionEntry(connection: string): Promise<ConnectionToken | null> {
    const backend = await this.getBackend();
    return backend.getConnectionToken(connection);
  }

  async listConnections(): Promise<string[]> {
    const backend = await this.getBackend();
    return backend.listConnections();
  }

  // ── Write ─────────────────────────────────────────────────────

  async saveAuth0Tokens(tokens: Auth0Tokens): Promise<void> {
    const backend = await this.getBackend();
    await backend.saveAuth0Tokens(tokens);
    log('auth0 tokens saved');
  }

  async saveConnectionToken(connection: string, token: ConnectionToken): Promise<void> {
    const backend = await this.getBackend();
    await backend.saveConnectionToken(connection, token);
    log('connection token saved for %s', connection);
  }

  async removeConnection(connection: string): Promise<boolean> {
    const backend = await this.getBackend();
    const removed = await backend.removeConnection(connection);
    if (removed) log('connection removed: %s', connection);
    return removed;
  }

  async getServiceSettings(service: string): Promise<ServiceSettings | null> {
    const backend = await this.getBackend();
    return backend.getServiceSettings(service);
  }

  async saveServiceSettings(service: string, settings: ServiceSettings): Promise<void> {
    const backend = await this.getBackend();
    await backend.saveServiceSettings(service, settings);
    log('service settings saved for %s', service);
  }

  async clear(): Promise<void> {
    const backend = await this.getBackend();
    await backend.clear();
    log('credentials cleared');
  }

  // ── Internals ─────────────────────────────────────────────────

  private async getBackend(): Promise<CredentialBackend> {
    if (this.backend) {
      return this.backend;
    }

    if (!this.backendLoader) {
      throw new Error('Credential backend is not initialized');
    }

    if (!this.backendPromise) {
      this.backendPromise = this.backendLoader().then((backend) => {
        this.backend = backend;
        return backend;
      });
    }

    return this.backendPromise;
  }

  private isExpired(expiresAt: number): boolean {
    return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
  }
}
