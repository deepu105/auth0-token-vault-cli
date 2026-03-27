/**
 * Canonical mapping of user-friendly service names to Auth0 connection
 * identifiers and their required OAuth scopes.
 *
 * All commands (connect, disconnect, connections) import from here
 * so adding a new service is a single-file change.
 */

interface ServiceEntry {
  connection: string;
  scopes: string[];
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
  },
};

/** Reverse lookup: connection identifier → service name */
const CONNECTION_TO_SERVICE = new Map<string, string>(
  Object.entries(SERVICE_REGISTRY).map(([service, entry]) => [entry.connection, service])
);

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

/** Get the user-friendly service name for an Auth0 connection identifier. */
export function getServiceForConnection(connection: string): string | undefined {
  return CONNECTION_TO_SERVICE.get(connection);
}

/** Get all available service names. */
export function getAvailableServices(): string[] {
  return Object.keys(SERVICE_REGISTRY);
}
