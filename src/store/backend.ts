import type { Auth0Tokens, ConnectionToken } from './types.js';

/**
 * Storage backend contract for credential persistence.
 * Both KeyringBackend and FileBackend implement this interface.
 * Expiry logic lives in the CredentialStore facade, not here.
 */
export interface CredentialBackend {
  getAuth0Tokens(): Promise<Auth0Tokens | null>;
  saveAuth0Tokens(tokens: Auth0Tokens): Promise<void>;
  getConnectionToken(connection: string): Promise<ConnectionToken | null>;
  saveConnectionToken(connection: string, token: ConnectionToken): Promise<void>;
  listConnections(): Promise<string[]>;
  removeConnection(connection: string): Promise<boolean>;
  clear(): Promise<void>;
}
