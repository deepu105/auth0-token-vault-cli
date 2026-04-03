/**
 * Canonical mapping of user-friendly service names to Auth0 connection
 * identifiers and their required OAuth scopes.
 *
 * All commands (connect, disconnect, connections) import from here
 * so adding a new service is a single-file change.
 */

export interface ServiceEntry {
  connection: string;
  scopes: string[];
  /** Default allowed domains for the `fetch` command. */
  allowedDomains: string[];
}

/** Result of resolveService() — consistent shape for both known and unknown services. */
export interface ResolvedService {
  connection: string;
  scopes: string[];
  allowedDomains: string[];
  /** true when the service is in the built-in registry. */
  isKnown: boolean;
}

const SERVICE_REGISTRY: Record<string, ServiceEntry> = {
  gmail: {
    connection: 'google-oauth2',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.labels',
    ],
    allowedDomains: ['*.googleapis.com'],
  },
  calendar: {
    connection: 'google-oauth2',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    allowedDomains: ['*.googleapis.com'],
  },
  github: {
    connection: 'github',
    scopes: [
      /* GitHub apps use fine grained auth */
    ],
    allowedDomains: ['api.github.com'],
  },
  slack: {
    connection: 'sign-in-with-slack',
    scopes: [
      'channels:read',
      'channels:history',
      'groups:read',
      'groups:history',
      'chat:write',
      'search:read.public',
      'reactions:write',
      'users:read',
      'users.profile:read',
    ],
    allowedDomains: ['slack.com', '*.slack.com'],
  },
};

/** Reverse lookup: connection identifier → service names (1:N) */
const CONNECTION_TO_SERVICES = new Map<string, string[]>();
for (const [service, entry] of Object.entries(SERVICE_REGISTRY)) {
  const existing = CONNECTION_TO_SERVICES.get(entry.connection) ?? [];
  existing.push(service);
  CONNECTION_TO_SERVICES.set(entry.connection, existing);
}

/** Get the connection config for a service name (case-insensitive). */
export function getServiceEntry(service: string): ServiceEntry | undefined {
  return SERVICE_REGISTRY[service.toLowerCase()];
}

/** Get the Auth0 connection identifier for a service name. */
export function getConnectionForService(service: string): string | undefined {
  return SERVICE_REGISTRY[service.toLowerCase()]?.connection;
}

/** Get the required scopes for a service name. */
export function getScopesForService(service: string): string[] | undefined {
  return SERVICE_REGISTRY[service.toLowerCase()]?.scopes;
}

/** Get the default allowed domains for a service name. */
export function getAllowedDomainsForService(service: string): string[] | undefined {
  return SERVICE_REGISTRY[service.toLowerCase()]?.allowedDomains;
}

/** Get the user-friendly service name for an Auth0 connection identifier (first match). */
export function getServiceForConnection(connection: string): string | undefined {
  const services = CONNECTION_TO_SERVICES.get(connection);
  return services?.[0];
}

/** Get all user-friendly service names for an Auth0 connection identifier. */
export function getServicesForConnection(connection: string): string[] {
  return CONNECTION_TO_SERVICES.get(connection) ?? [];
}

/** Get all available service names. */
export function getAvailableServices(): string[] {
  return Object.keys(SERVICE_REGISTRY);
}

/**
 * Resolve a service name to a connection config.
 *
 * Known services (gmail, calendar, github, slack) return the registry entry
 * with `isKnown: true`. Unknown services return a minimal entry that uses the
 * input string as the Auth0 connection name directly, with empty scopes and
 * allowed domains, and `isKnown: false`.
 */
export function resolveService(service: string): ResolvedService {
  const entry = getServiceEntry(service);
  if (entry) {
    return { ...entry, isKnown: true };
  }
  return {
    connection: service.toLowerCase(),
    scopes: [],
    allowedDomains: [],
    isKnown: false,
  };
}
