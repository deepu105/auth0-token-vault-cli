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

export interface ServiceSettings {
  /** Allowed domains for the `fetch` command (e.g. ["api.github.com"]) */
  allowedDomains: string[];
}

export interface CredentialData {
  config?: StoredConfig;
  auth0?: Auth0Tokens;
  connections: Record<string, ConnectionToken>;
  /** Per-service settings keyed by service name (e.g. "gmail", "github") */
  serviceSettings?: Record<string, ServiceSettings>;
}
