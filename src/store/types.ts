export interface Auth0Tokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Absolute timestamp (ms since epoch) when the access token expires */
  expiresAt: number;
}

export interface ConnectionToken {
  accessToken: string;
  /** Absolute timestamp (ms since epoch) when this token expires */
  expiresAt: number;
  scopes: string[];
}

export interface StoredConfig {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience?: string;
}

export interface CredentialData {
  config?: StoredConfig;
  auth0?: Auth0Tokens;
  connections: Record<string, ConnectionToken>;
}
