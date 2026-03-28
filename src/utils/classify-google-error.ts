import { EXIT_AUTH_REQUIRED, EXIT_AUTHZ_REQUIRED } from './exit-codes.js';
import { capitalize } from './format-helpers.js';

/** Classify Google API errors (gmail, calendar). */
export function classifyGoogleError(
  err: unknown,
  serviceName: string
): { code: string; message: string; exitCode: number } | undefined {
  const statusCode = (err as any)?.code ?? (err as any)?.status;
  if (statusCode === 401) {
    return {
      code: 'auth_required',
      message: `${capitalize(serviceName)} token expired. Run \`auth0-tv connect ${serviceName}\`.`,
      exitCode: EXIT_AUTH_REQUIRED,
    };
  }
  if (statusCode === 403) {
    return {
      code: 'authorization_required',
      message: `Insufficient ${capitalize(serviceName)} scopes. Run \`auth0-tv connect ${serviceName}\` to grant additional permissions.`,
      exitCode: EXIT_AUTHZ_REQUIRED,
    };
  }
  return undefined;
}
