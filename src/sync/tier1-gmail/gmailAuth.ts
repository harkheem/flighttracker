import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// TODO: replace with a real OAuth client ID from Google Cloud Console
// (APIs & Services > Credentials > OAuth client ID > type "iOS"/"Android" or "Web" depending on
// the auth-session proxy strategy you choose). Read-only Gmail access requires the
// gmail.readonly scope and, since this is a personal single-user app, you can keep the OAuth
// consent screen in "Testing" mode with your own account added as a test user indefinitely.
const GOOGLE_CLIENT_ID = 'REPLACE_ME.apps.googleusercontent.com';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const ACCESS_TOKEN_KEY = 'gmail_access_token';
const REFRESH_TOKEN_KEY = 'gmail_refresh_token';
const EXPIRES_AT_KEY = 'gmail_expires_at';

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

// Launches the Google OAuth consent flow and stores tokens in expo-secure-store
// (iOS Keychain / Android Keystore) — never in SQLite.
export async function connectGmail(): Promise<GmailTokens> {
  // Resolves to `flighttracker://` (see app.json "scheme") in a dev-client/standalone build.
  // TODO: register this exact redirect URI in the Google Cloud OAuth client's "Authorized
  // redirect URIs" once GOOGLE_CLIENT_ID above is filled in — log it once via
  // console.log(redirectUri) during setup to get the exact string to paste in.
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'flighttracker' });

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: [GMAIL_READONLY_SCOPE, 'openid', 'email'],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Gmail sign-in was cancelled or failed.');
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: GOOGLE_CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery
  );

  const tokens: GmailTokens = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? null,
    expiresAt: Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
  };

  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  await SecureStore.setItemAsync(EXPIRES_AT_KEY, String(tokens.expiresAt));

  return tokens;
}

export async function getStoredGmailTokens(): Promise<GmailTokens | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  const expiresAtRaw = await SecureStore.getItemAsync(EXPIRES_AT_KEY);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAtRaw ? Number(expiresAtRaw) : 0,
  };
}

// Refreshes the access token using the stored refresh token if the current one is expired/near-expiry.
export async function ensureValidAccessToken(): Promise<string> {
  const tokens = await getStoredGmailTokens();
  if (!tokens) throw new Error('Gmail is not connected.');

  const nearExpiry = tokens.expiresAt - Date.now() < 60_000;
  if (!nearExpiry) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error('Gmail token expired and no refresh token is stored.');

  const refreshed = await AuthSession.refreshAsync(
    { clientId: GOOGLE_CLIENT_ID, refreshToken: tokens.refreshToken },
    discovery
  );

  const newAccessToken = refreshed.accessToken;
  const newExpiresAt = Date.now() + (refreshed.expiresIn ?? 3600) * 1000;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken);
  await SecureStore.setItemAsync(EXPIRES_AT_KEY, String(newExpiresAt));

  return newAccessToken;
}

export async function disconnectGmail(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(EXPIRES_AT_KEY);
}

export async function isGmailConnected(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)) !== null;
}
