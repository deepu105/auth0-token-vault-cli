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

export interface CredentialData {
  auth0?: Auth0Tokens;
  connections: Record<string, ConnectionToken>;
}
