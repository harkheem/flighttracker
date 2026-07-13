import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '515505738344-lhlipe10ic0tmivmchj05o5ic133efqa.apps.googleusercontent.com';

// Google's "iOS" OAuth client type requires the redirect URI to use this exact reversed-client-id
// scheme — there's no "Authorized redirect URIs" list to configure for this client type. This
// scheme must also be registered as a CFBundleURLTypes entry (see app.json ios.infoPlist).
const REVERSED_CLIENT_ID = GOOGLE_CLIENT_ID.split('.').reverse().join('.');
const GOOGLE_REDIRECT_URI = `${REVERSED_CLIENT_ID}:/oauth2redirect`;

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// Multiple Gmail accounts can be connected at once (see SettingsScreen "Add another Gmail
// account"). Tokens are stored per-account, keyed by email; ACCOUNTS_INDEX_KEY is the only way to
// enumerate them since SecureStore has no "list keys" API.
const ACCOUNTS_INDEX_KEY = 'gmail_accounts_index';

// SecureStore keys may only contain alphanumeric characters, ".", "-", and "_" — email addresses
// contain "@" (and sometimes other characters), so sanitize before using one as a key.
function sanitizeForKey(email: string): string {
  return email.replace(/[^a-zA-Z0-9._-]/g, '_');
}
const accessTokenKey = (email: string) => `gmail_access_token_${sanitizeForKey(email)}`;
const refreshTokenKey = (email: string) => `gmail_refresh_token_${sanitizeForKey(email)}`;
const expiresAtKey = (email: string) => `gmail_expires_at_${sanitizeForKey(email)}`;

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export interface GmailTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
}

export async function listGmailAccounts(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(ACCOUNTS_INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function addToAccountsIndex(email: string): Promise<void> {
  const accounts = await listGmailAccounts();
  if (!accounts.includes(email)) {
    await SecureStore.setItemAsync(ACCOUNTS_INDEX_KEY, JSON.stringify([...accounts, email]));
  }
}

async function removeFromAccountsIndex(email: string): Promise<void> {
  const accounts = await listGmailAccounts();
  await SecureStore.setItemAsync(ACCOUNTS_INDEX_KEY, JSON.stringify(accounts.filter((e) => e !== email)));
}

async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google account email.');
  const json = await res.json();
  if (!json.email) throw new Error('Google account has no email address.');
  return json.email as string;
}

// Launches the Google OAuth consent flow and stores tokens in expo-secure-store (iOS Keychain /
// Android Keystore), keyed by the signed-in account's email — never in SQLite. `select_account`
// forces Google's account chooser so this can be used to add a second/third Gmail account rather
// than silently reusing whichever account is already signed in on-device.
export async function connectGmail(): Promise<{ email: string; tokens: GmailTokens }> {
  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: [GMAIL_READONLY_SCOPE, 'openid', 'email'],
    redirectUri: GOOGLE_REDIRECT_URI,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent select_account' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Gmail sign-in was cancelled or failed.');
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: GOOGLE_CLIENT_ID,
      code: result.params.code,
      redirectUri: GOOGLE_REDIRECT_URI,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery
  );

  const tokens: GmailTokens = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? null,
    expiresAt: Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
  };

  const email = await fetchGoogleEmail(tokens.accessToken);

  await SecureStore.setItemAsync(accessTokenKey(email), tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(refreshTokenKey(email), tokens.refreshToken);
  }
  await SecureStore.setItemAsync(expiresAtKey(email), String(tokens.expiresAt));
  await addToAccountsIndex(email);

  return { email, tokens };
}

export async function getStoredGmailTokens(email: string): Promise<GmailTokens | null> {
  const accessToken = await SecureStore.getItemAsync(accessTokenKey(email));
  const refreshToken = await SecureStore.getItemAsync(refreshTokenKey(email));
  const expiresAtRaw = await SecureStore.getItemAsync(expiresAtKey(email));
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAtRaw ? Number(expiresAtRaw) : 0,
  };
}

// Refreshes the access token for `email` using its stored refresh token if near-expiry.
export async function ensureValidAccessToken(email: string): Promise<string> {
  const tokens = await getStoredGmailTokens(email);
  if (!tokens) throw new Error(`Gmail account ${email} is not connected.`);

  const nearExpiry = tokens.expiresAt - Date.now() < 60_000;
  if (!nearExpiry) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error(`Gmail token for ${email} expired and no refresh token is stored.`);

  const refreshed = await AuthSession.refreshAsync(
    { clientId: GOOGLE_CLIENT_ID, refreshToken: tokens.refreshToken },
    discovery
  );

  const newAccessToken = refreshed.accessToken;
  const newExpiresAt = Date.now() + (refreshed.expiresIn ?? 3600) * 1000;
  await SecureStore.setItemAsync(accessTokenKey(email), newAccessToken);
  await SecureStore.setItemAsync(expiresAtKey(email), String(newExpiresAt));

  return newAccessToken;
}

export async function disconnectGmail(email: string): Promise<void> {
  await SecureStore.deleteItemAsync(accessTokenKey(email));
  await SecureStore.deleteItemAsync(refreshTokenKey(email));
  await SecureStore.deleteItemAsync(expiresAtKey(email));
  await removeFromAccountsIndex(email);
}

export async function isGmailConnected(): Promise<boolean> {
  return (await listGmailAccounts()).length > 0;
}
