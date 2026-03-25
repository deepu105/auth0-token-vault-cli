import keytar from 'keytar';
import { log } from '../utils/logger.js';
import type { Auth0Tokens, ConnectionToken, StoredConfig } from './types.js';
import type { CredentialBackend } from './backend.js';

const SERVICE_NAME = 'auth0-tv';
const AUTH0_CONFIG_ACCOUNT = 'AUTH0_CONFIG';
const AUTH0_TOKENS_ACCOUNT = 'AUTH0_TOKENS';
const CONNECTION_PREFIX = 'CONNECTION:';

export class KeyringBackend implements CredentialBackend {
  async getConfig(): Promise<StoredConfig | null> {
    const raw = await this.get(AUTH0_CONFIG_ACCOUNT);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredConfig;
    } catch {
      log('failed to parse config from keyring');
      return null;
    }
  }

  async saveConfig(config: StoredConfig): Promise<void> {
    await this.set(AUTH0_CONFIG_ACCOUNT, JSON.stringify(config));
  }

  async getAuth0Tokens(): Promise<Auth0Tokens | null> {
    const raw = await this.get(AUTH0_TOKENS_ACCOUNT);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Auth0Tokens;
    } catch {
      log('failed to parse auth0 tokens from keyring');
      return null;
    }
  }

  async saveAuth0Tokens(tokens: Auth0Tokens): Promise<void> {
    await this.set(AUTH0_TOKENS_ACCOUNT, JSON.stringify(tokens));
  }

  async getConnectionToken(connection: string): Promise<ConnectionToken | null> {
    const raw = await this.get(`${CONNECTION_PREFIX}${connection}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ConnectionToken;
    } catch {
      log('failed to parse connection token for %s from keyring', connection);
      return null;
    }
  }

  async saveConnectionToken(connection: string, token: ConnectionToken): Promise<void> {
    await this.set(`${CONNECTION_PREFIX}${connection}`, JSON.stringify(token));
  }

  async listConnections(): Promise<string[]> {
    try {
      const entries = await keytar.findCredentials(SERVICE_NAME);
      return entries
        .filter((e) => e.account.startsWith(CONNECTION_PREFIX))
        .map((e) => e.account.slice(CONNECTION_PREFIX.length));
    } catch (err) {
      log('failed to list connections from keyring: %O', err);
      return [];
    }
  }

  async removeConnection(connection: string): Promise<boolean> {
    try {
      return await keytar.deletePassword(SERVICE_NAME, `${CONNECTION_PREFIX}${connection}`);
    } catch (err) {
      log('failed to remove connection %s from keyring: %O', connection, err);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const entries = await keytar.findCredentials(SERVICE_NAME);
      await Promise.all(
        entries
          .filter((e) => e.account !== AUTH0_CONFIG_ACCOUNT)
          .map((e) => keytar.deletePassword(SERVICE_NAME, e.account))
      );
      log('keyring credentials cleared');
    } catch (err) {
      log('failed to clear keyring credentials: %O', err);
    }
  }

  private async get(account: string): Promise<string | null> {
    try {
      return await keytar.getPassword(SERVICE_NAME, account);
    } catch (err) {
      log('keyring get failed for %s: %O', account, err);
      return null;
    }
  }

  private async set(account: string, value: string): Promise<void> {
    try {
      await keytar.setPassword(SERVICE_NAME, account, value);
    } catch (err) {
      log('keyring set failed for %s: %O', account, err);
      throw err;
    }
  }
}
