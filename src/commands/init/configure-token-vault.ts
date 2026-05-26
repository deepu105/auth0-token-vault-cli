import * as p from '@clack/prompts';
import {
  runAuth0Command,
  runAuth0Api,
  isAuth0CliInstalled,
  isAuth0LoggedIn,
  getActiveTenantDomain,
} from '../../utils/auth0-cli.js';
import { log } from '../../utils/logger.js';
import { cleanDomain } from '../../utils/prompt.js';

const TOKEN_VAULT_GRANT_TYPE =
  'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token';

const CONNECTED_ACCOUNTS_SCOPES = [
  'create:me:connected_accounts',
  'read:me:connected_accounts',
  'delete:me:connected_accounts',
];

const MY_ACCOUNT_API_SCOPES = [
  { value: 'read:me', description: 'Read user profile' },
  { value: 'update:me', description: 'Update user profile' },
  { value: 'delete:me', description: 'Delete user account' },
  { value: 'create:me:connected_accounts', description: 'Link external accounts' },
  { value: 'read:me:connected_accounts', description: 'Read linked accounts' },
  { value: 'delete:me:connected_accounts', description: 'Unlink external accounts' },
];

export interface TokenVaultConfig {
  callbackUrls: string[];
  logoutUrls: string[];
  /** Pre-fill app name to skip the interactive prompt and create a new app. */
  appName?: string;
  /** Use an existing application by client ID (skips create/select prompt). */
  appId?: string;
  /** Skip connection selection (useful for CI/testing). */
  skipConnections?: boolean;
}

export interface TokenVaultResult {
  clientId: string;
  clientSecret: string;
  name: string;
  domain: string;
}

/**
 * Configure Auth0 Token Vault for refresh_token_exchange flavor.
 * Replaces the external `configure-auth0-token-vault` package.
 */
export async function configureTokenVault(config: TokenVaultConfig): Promise<TokenVaultResult> {
  // Check auth0 CLI
  if (!(await isAuth0CliInstalled())) {
    throw new Error('Auth0 CLI is not installed. Install from https://github.com/auth0/auth0-cli');
  }
  p.log.success('Auth0 CLI detected');

  // Check login
  if (!(await isAuth0LoggedIn())) {
    if (!process.stdin.isTTY) {
      await runAuth0Command(['login', '--scopes', 'create:client_grants'], {
        stdio: 'inherit',
      });
    } else {
      const shouldLogin = await p.confirm({
        message: 'You need to log in to Auth0 CLI. Log in now?',
        initialValue: true,
      });
      if (p.isCancel(shouldLogin) || !shouldLogin) {
        p.cancel('Login required to continue.');
        process.exit(1);
      }
      await runAuth0Command(['login', '--scopes', 'create:client_grants'], {
        stdio: 'inherit',
      });
    }
  }

  // Get tenant domain
  const domain = cleanDomain(await getActiveTenantDomain());
  p.log.success(`Connected to tenant: ${domain}`);

  // Create or select application
  const app = await chooseApplication(config);
  p.log.info(`Using application: ${app.name} (${app.id})`);

  // Configure app for Token Vault
  const configSpinner = p.spinner();
  configSpinner.start('Configuring application for Token Vault...');
  await configureApplicationForTokenVault(app.id);
  configSpinner.stop('Application configured for Token Vault');

  // Configure connections
  if (!config.skipConnections) {
    await configureConnections(app.id);
  }

  // Setup Connected Accounts (foundation for refresh_token_exchange)
  const accountsSpinner = p.spinner();
  accountsSpinner.start('Setting up Connected Accounts...');
  await enableMyAccountApi(domain);
  await createClientGrant(app.id, domain);
  await configureMrrt(app.id, domain);
  accountsSpinner.stop('Connected Accounts configured');

  // Retrieve client secret
  const secret = await getClientSecret(app.id);

  return { clientId: app.id, clientSecret: secret, name: app.name, domain };
}

// ---------------------------------------------------------------------------
// Application setup (new or existing)
// ---------------------------------------------------------------------------

async function chooseApplication(config: TokenVaultConfig): Promise<{ id: string; name: string }> {
  // If appId is provided, fetch that existing app directly
  if (config.appId) {
    const s = p.spinner();
    s.start('Fetching application details...');
    const stdout = await runAuth0Command(['apps', 'show', config.appId, '--json', '--no-input']);
    const app = JSON.parse(stdout);
    s.stop('Application loaded');
    return { id: app.client_id, name: app.name };
  }

  // If appName is pre-filled, skip prompts and create directly
  if (config.appName) {
    return createNewApplication(config, config.appName);
  }

  const appChoice = await p.select({
    message: 'How would you like to configure the application?',
    options: [
      { value: 'new' as const, label: 'Create a new application' },
      { value: 'existing' as const, label: 'Use an existing application' },
    ],
  });

  if (p.isCancel(appChoice)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  if (appChoice === 'new') {
    const name = await p.text({
      message: 'Enter application name:',
      placeholder: 'Token Vault App',
      defaultValue: 'Token Vault App',
    });

    if (p.isCancel(name)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    return createNewApplication(config, name);
  }

  return selectExistingApplication();
}

async function createNewApplication(
  config: TokenVaultConfig,
  name: string
): Promise<{ id: string; name: string }> {
  const sanitizedName = name.replace(/\+/g, '').trim();

  const s = p.spinner();
  s.start(`Creating application "${sanitizedName}"...`);

  const createArgs = [
    'apps',
    'create',
    '--name',
    sanitizedName,
    '--type',
    'regular',
    '--json',
    '--no-input',
  ];

  if (config.callbackUrls.length) {
    createArgs.push('--callbacks', config.callbackUrls.join(','));
  }
  if (config.logoutUrls.length) {
    createArgs.push('--logout-urls', config.logoutUrls.join(','));
  }

  const stdout = await runAuth0Command(createArgs);
  const app = JSON.parse(stdout);
  s.stop(`Application created: ${app.name}`);
  return { id: app.client_id, name: app.name };
}

async function selectExistingApplication(): Promise<{ id: string; name: string }> {
  const s = p.spinner();
  s.start('Fetching applications...');

  let apps: Array<{ client_id: string; name: string }>;
  try {
    const stdout = await runAuth0Command(['apps', 'list', '--json', '--no-input']);
    apps = JSON.parse(stdout);
  } catch {
    s.stop('Failed to fetch applications');
    throw new Error('Could not list applications. Check your Auth0 CLI login.');
  }

  const filtered = apps.filter((app) => app.name !== 'All Applications');
  s.stop('Applications loaded');

  if (filtered.length === 0) {
    p.log.warn('No applications found. Creating a new one instead.');
    const name = await p.text({
      message: 'Enter application name:',
      placeholder: 'Token Vault App',
      defaultValue: 'Token Vault App',
    });

    if (p.isCancel(name)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    // Can't call createNewApplication without config, so just create inline
    const stdout = await runAuth0Command([
      'apps',
      'create',
      '--name',
      name.replace(/\+/g, '').trim(),
      '--type',
      'regular',
      '--json',
      '--no-input',
    ]);
    const app = JSON.parse(stdout);
    return { id: app.client_id, name: app.name };
  }

  const selected = await p.select({
    message: 'Select an application:',
    options: filtered.map((app) => ({
      value: { id: app.client_id, name: app.name },
      label: app.name,
      hint: app.client_id,
    })),
  });

  if (p.isCancel(selected)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Token Vault configuration
// ---------------------------------------------------------------------------

async function configureApplicationForTokenVault(appId: string): Promise<void> {
  const stdout = await runAuth0Command(['apps', 'show', appId, '--json', '--no-input']);
  const app = JSON.parse(stdout);

  const grantTypes: string[] = app.grant_types || ['authorization_code', 'refresh_token'];
  for (const gt of [TOKEN_VAULT_GRANT_TYPE, 'refresh_token', 'authorization_code']) {
    if (!grantTypes.includes(gt)) grantTypes.push(gt);
  }

  const updatePayload: Record<string, unknown> = {
    is_first_party: true,
    oidc_conformant: true,
    grant_types: grantTypes,
  };

  if (app.token_endpoint_auth_method === 'none') {
    updatePayload.token_endpoint_auth_method = 'client_secret_post';
  }

  await runAuth0Api('patch', `clients/${appId}`, updatePayload);
}

// ---------------------------------------------------------------------------
// Connection configuration
// ---------------------------------------------------------------------------

const SUPPORTED_STRATEGIES = [
  'google-oauth2',
  'github',
  'linkedin',
  'microsoft',
  'facebook',
  'twitter',
  'dropbox',
  'box',
  'salesforce',
  'fitbit',
  'slack',
  'spotify',
  'stripe-connect',
  'oauth2',
  'oidc',
];

interface Connection {
  id: string;
  name: string;
  strategy: string;
  options?: Record<string, unknown>;
  enabled_clients?: string[];
}

async function configureConnections(appId: string): Promise<void> {
  const s = p.spinner();
  s.start('Fetching connections...');

  let connections: Connection[];
  try {
    const stdout = await runAuth0Api('get', 'connections');
    connections = JSON.parse(stdout);
  } catch {
    s.stop('Could not fetch connections. Configure them manually.');
    return;
  }

  const eligible = connections.filter(
    (c) =>
      SUPPORTED_STRATEGIES.includes(c.strategy) ||
      c.strategy?.startsWith('oauth') ||
      c.strategy?.startsWith('oidc')
  );

  s.stop('Connections loaded');

  if (eligible.length === 0) {
    p.log.warn('No eligible social/enterprise connections found.');
    return;
  }

  const selected = await p.multiselect({
    message: 'Select connections to enable for Token Vault:',
    options: eligible.map((c) => ({
      value: c,
      label: c.name,
      hint: c.strategy,
    })),
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  if (!selected || selected.length === 0) {
    p.log.warn('No connections selected.');
    return;
  }

  for (const conn of selected) {
    const connSpinner = p.spinner();
    connSpinner.start(`Configuring ${conn.name}...`);
    try {
      await runAuth0Api('patch', `connections/${conn.id}`, {
        options: { ...conn.options, connected_accounts: { active: true } },
      });
      await runAuth0Api('patch', `connections/${conn.id}`, {
        enabled_clients: [...new Set([...(conn.enabled_clients || []), appId])],
      });
      connSpinner.stop(`${conn.name} configured for Token Vault`);
    } catch {
      connSpinner.stop(
        `Could not fully configure ${conn.name}. Enable Connected Accounts manually.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Connected Accounts: My Account API
// ---------------------------------------------------------------------------

async function enableMyAccountApi(domain: string): Promise<void> {
  const identifier = `https://${domain}/me/`;

  let apis: Array<{
    id: string;
    scopes?: Array<{ value: string; description?: string }>;
    subject_type_authorization?: { user?: { policy?: string } };
  }>;

  try {
    const stdout = await runAuth0Api(
      'get',
      `resource-servers?identifier=${encodeURIComponent(identifier)}`
    );
    apis = JSON.parse(stdout);
  } catch {
    p.log.warn('Could not verify My Account API. Ensure it is enabled in the Dashboard.');
    return;
  }

  if (apis && apis.length > 0) {
    const existing = apis[0];
    const existingScopes = existing.scopes || [];
    const existingValues = existingScopes.map((s) => s.value);
    const missing = MY_ACCOUNT_API_SCOPES.filter((s) => !existingValues.includes(s.value));

    const update: Record<string, unknown> = {};
    if (missing.length > 0) {
      update.scopes = [...existingScopes, ...missing];
    }
    if (existing.subject_type_authorization?.user?.policy !== 'require_client_grant') {
      update.subject_type_authorization = { user: { policy: 'require_client_grant' } };
    }

    if (Object.keys(update).length > 0) {
      await runAuth0Api('patch', `resource-servers/${existing.id}`, update);
      log('My Account API updated with missing scopes/policy');
    }
    return;
  }

  // Try to create it
  try {
    await runAuth0Api('post', 'resource-servers', {
      identifier,
      name: 'My Account',
      scopes: MY_ACCOUNT_API_SCOPES,
      signing_alg: 'RS256',
      allow_offline_access: true,
      token_lifetime: 86400,
      token_lifetime_for_web: 7200,
      skip_consent_for_verifiable_first_party_clients: true,
      subject_type_authorization: { user: { policy: 'require_client_grant' } },
    });
  } catch {
    p.log.warn('My Account API needs manual activation in the Auth0 Dashboard → APIs.');
  }
}

// ---------------------------------------------------------------------------
// Connected Accounts: Client Grant
// ---------------------------------------------------------------------------

async function createClientGrant(appId: string, domain: string): Promise<void> {
  const audience = `https://${domain}/me/`;

  try {
    const stdout = await runAuth0Api(
      'get',
      `client-grants?client_id=${appId}&audience=${encodeURIComponent(audience)}`
    );
    const grants: Array<{ id: string; scope?: string[]; subject_type?: string }> =
      JSON.parse(stdout);
    const userGrant = grants.find((g) => g.subject_type === 'user');

    if (userGrant) {
      const newScopes = [...new Set([...(userGrant.scope || []), ...CONNECTED_ACCOUNTS_SCOPES])];
      await runAuth0Api('patch', `client-grants/${userGrant.id}`, { scope: newScopes });
      return;
    }
  } catch {
    // Grant doesn't exist yet
  }

  try {
    await runAuth0Api('post', 'client-grants', {
      client_id: appId,
      audience,
      scope: CONNECTED_ACCOUNTS_SCOPES,
      subject_type: 'user',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (!message.includes('already exists')) {
      p.log.warn(
        'Could not create client grant. Create it manually in Dashboard → APIs → My Account.'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Connected Accounts: MRRT
// ---------------------------------------------------------------------------

async function configureMrrt(appId: string, domain: string): Promise<void> {
  const audience = `https://${domain}/me/`;

  try {
    const stdout = await runAuth0Command(['apps', 'show', appId, '--json', '--no-input']);
    const app = JSON.parse(stdout);
    const refreshTokenConfig = app.refresh_token || {};
    const policies: Array<{ audience: string; scope?: string[] }> =
      refreshTokenConfig.policies || [];

    if (policies.some((pol) => pol.audience === audience)) return;

    await runAuth0Api('patch', `clients/${appId}`, {
      refresh_token: {
        ...refreshTokenConfig,
        policies: [...policies, { audience, scope: CONNECTED_ACCOUNTS_SCOPES }],
      },
    });
  } catch {
    p.log.warn(
      'Could not configure MRRT. Enable it manually in app settings → Multi-Resource Refresh Token.'
    );
  }
}

// ---------------------------------------------------------------------------
// Retrieve client secret
// ---------------------------------------------------------------------------

async function getClientSecret(appId: string): Promise<string> {
  const stdout = await runAuth0Command([
    'apps',
    'show',
    appId,
    '--reveal-secrets',
    '--json',
    '--no-input',
  ]);
  const app = JSON.parse(stdout);
  const secret = app.client_secret || app.clientSecret;
  if (!secret) {
    throw new Error('Could not retrieve client secret. Check the app in the Auth0 Dashboard.');
  }
  return secret;
}
