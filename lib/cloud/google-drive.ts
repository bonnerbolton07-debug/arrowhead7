// =============================================================================
// Arrowhead 7 — Google Drive Client
// =============================================================================
// OAuth2 + Drive API v3 wrapper. Token refresh handled transparently.

import {
  getCloudConnection,
  updateCloudConnectionTokens,
  isTokenExpired,
  type OAuthTokens,
} from '@/lib/oauth/store';

const GOOGLE_OAUTH = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function googleClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured');
  }
  return { clientId, clientSecret };
}

export function buildGoogleAuthUrl(opts: {
  provider: 'google-drive' | 'youtube';
  scopes: string[];
  state: string;
  /** Redirect URI to register on /authorize — must match the URI used at
   *  token-exchange time byte-for-byte (Google enforces this). */
  redirectUri: string;
}): string {
  const { clientId } = googleClientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: opts.scopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: opts.state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  provider: 'google-drive' | 'youtube',
  redirectUri: string
): Promise<OAuthTokens> {
  const { clientId, clientSecret } = googleClientCreds();
  const res = await fetch(GOOGLE_OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    // Surface redirect_uri_mismatch with the exact URI we sent — without
    // this hint, the only thing the user sees on Google's side is "Error 400"
    // and they have no way to know which URI to register.
    if (/redirect_uri_mismatch|invalid_grant/i.test(errorBody)) {
      throw new Error(
        `Google rejected redirect_uri="${redirectUri}". Add this exact URI to ` +
          `your Google Cloud Console OAuth client's "Authorized redirect URIs".`
      );
    }
    throw new Error(`Google token exchange failed: ${res.status} ${errorBody}`);
  }
  return (await res.json()) as OAuthTokens;
}

export async function refreshGoogleToken(refreshToken: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = googleClientCreds();
  const res = await fetch(GOOGLE_OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  const tokens = (await res.json()) as OAuthTokens;
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
  return tokens;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  const res = await fetch(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status}`);
  }
  return res.json();
}

export async function getValidDriveAccessToken(userId: string): Promise<{
  accessToken: string;
  connectionId: string;
  accountId: string;
}> {
  const conn = await getCloudConnection(userId, 'google_drive');
  if (!conn) throw new Error('Google Drive not connected');

  if (isTokenExpired(conn.token_expires_at) && conn.refresh_token) {
    const refreshed = await refreshGoogleToken(conn.refresh_token);
    await updateCloudConnectionTokens(conn.id, refreshed);
    return {
      accessToken: refreshed.access_token,
      connectionId: conn.id,
      accountId: conn.account_id,
    };
  }
  return {
    accessToken: conn.access_token,
    connectionId: conn.id,
    accountId: conn.account_id,
  };
}

// ─── Drive API ───────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  thumbnailLink?: string;
  iconLink?: string;
  parents?: string[];
  webViewLink?: string;
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
}

export async function listDriveFiles(opts: {
  accessToken: string;
  folderId?: string;
  pageToken?: string;
  pageSize?: number;
  videosOnly?: boolean;
}): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const folderId = opts.folderId;
  const baseQuery = ['trashed = false'];
  if (folderId) {
    baseQuery.unshift(`'${folderId}' in parents`);
  }
  if (opts.videosOnly) {
    baseQuery.push("(mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')");
  }
  const params = new URLSearchParams({
    q: baseQuery.join(' and '),
    pageSize: String(opts.pageSize ?? 100),
    fields:
      'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,parents,webViewLink,videoMediaMetadata)',
    orderBy: 'folder,modifiedTime desc',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  if (opts.pageToken) params.set('pageToken', opts.pageToken);

  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive list failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getDriveFile(opts: {
  accessToken: string;
  fileId: string;
}): Promise<DriveFile> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(opts.fileId)}?fields=id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,videoMediaMetadata&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${opts.accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Drive file fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function downloadDriveFile(opts: {
  accessToken: string;
  fileId: string;
}): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; contentLength: number }> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(opts.fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${opts.accessToken}` } }
  );
  if (!res.ok || !res.body) {
    throw new Error(`Drive download failed: ${res.status} ${await res.text()}`);
  }
  return {
    stream: res.body,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    contentLength: Number(res.headers.get('content-length') ?? 0),
  };
}
