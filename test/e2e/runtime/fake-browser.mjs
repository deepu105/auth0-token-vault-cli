#!/usr/bin/env node

function findUrlArg(args) {
  return [...args].reverse().find((arg) => arg.startsWith('http://') || arg.startsWith('https://'));
}

async function main() {
  const target = findUrlArg(process.argv.slice(2));
  if (!target) {
    throw new Error('Fake browser did not receive a URL argument.');
  }

  const url = new URL(target);

  if (url.searchParams.has('redirect_uri')) {
    const callbackUrl = new URL(url.searchParams.get('redirect_uri'));
    callbackUrl.searchParams.set('code', 'e2e-auth-code');
    callbackUrl.searchParams.set('state', url.searchParams.get('state') || '');

    const response = await fetch(callbackUrl);
    if (!response.ok) {
      throw new Error(`Login callback failed with HTTP ${response.status}`);
    }
    return;
  }

  if (url.searchParams.has('returnTo')) {
    const response = await fetch(url.searchParams.get('returnTo'));
    if (!response.ok) {
      throw new Error(`Logout callback failed with HTTP ${response.status}`);
    }
    return;
  }

  const redirectUri = process.env.AUTH0_TV_E2E_CONNECT_REDIRECT_URI;
  const state = process.env.AUTH0_TV_E2E_CONNECT_STATE;
  if (!redirectUri || !state) {
    throw new Error('Connect callback details were not provided to the fake browser.');
  }

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set('connect_code', 'e2e-connect-code');
  callbackUrl.searchParams.set('state', state);

  const response = await fetch(callbackUrl);
  if (!response.ok) {
    throw new Error(`Connect callback failed with HTTP ${response.status}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
