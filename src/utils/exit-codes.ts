/** General / unexpected error */
export const EXIT_GENERAL = 1;

/** Invalid input or usage */
export const EXIT_INVALID_INPUT = 2;

/** Authentication required (not logged in or token expired) */
export const EXIT_AUTH_REQUIRED = 3;

/** Authorization required (service not connected) */
export const EXIT_AUTHZ_REQUIRED = 4;

/** Upstream service error (e.g. Gmail API failure) */
export const EXIT_SERVICE_ERROR = 5;

/** Network error (unreachable host, timeout) */
export const EXIT_NETWORK_ERROR = 6;
