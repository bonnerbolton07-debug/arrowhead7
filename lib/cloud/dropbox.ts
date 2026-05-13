// =============================================================================
// Arrowhead 7 — Dropbox Client
// =============================================================================
// OAuth2 PKCE-friendly token exchange + Dropbox API v2 wrappers.

import {
  getCloudConnection,
  updateCloudConnectionTokens,
  isTokenExpired,
  type OAuthTokens,
} from '@/lib/oauth/store';
import { getRedirectUri } from '@/lib/oauth/state';

const DROPBOX_AUTH = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';

const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'];

export function dropboxClientCreds(): { key: string; secret: string } {
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  if (!key || !secret) {
    throw new Error('DROPBOX_APP_KEY / DROPBOX_APP_SECRET not configured');
  }
  return { key, secret };
}

export function buildDropboxAuthUrl(state: string): string {
  const { key } = dropboxClientCreds();
  const params = new URLSearchParams({
    client_id: key,
    response_type: 'code',
    redirect_uri: getRedirectUri('dropbox'),
    state,
    token_access_type: 'offline',
    // files.content.read covers listing + downloading
    scope: 'account_info.read files.metadata.read files.content.read',
  });
  return `${DROPBOX_AUTH}?${params.toString()}`;
}

export async function exchangeDropboxCode(code: string): Promise<OAuthTokens> {
  const { key, secret } = dropboxClientCreds();
  const res = await fetch(DROPBOX_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: key,
      client_secret: secret,
      redirect_uri: getRedirectUri('dropbox'),
    }),
  });
  if (!res.ok) {
    throw new Error(`Dropbox token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshDropboxToken(
  refreshToken: string
): Promise<OAuthTokens> {
  const { key, secret } = dropboxClientCreds();
  const res = await fetch(DROPBOX_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: key,
      client_secret: secret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Dropbox refresh failed: ${res.status} ${await res.text()}`);
  }
  const tokens = (await res.json()) as OAuthTokens;
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
  return tokens;
}

export async function fetchDropboxAccount(accessToken: string): Promise<{
  account_id: string;
  email: string;
  name: { display_name?: string };
  profile_photo_url?: string;
}> {
  const res = await fetch(`${DROPBOX_API}/users/get_current_account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Dropbox account fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function getValidDropboxAccessToken(userId: string): Promise<{
  accessToken: string;
  connectionId: string;
}> {
  const conn = await getCloudConnection(userId, 'dropbox');
  if (!conn) throw new Error('Dropbox not connected');
  if (isTokenExpired(conn.token_expires_at) && conn.refresh_token) {
    const refreshed = await refreshDropboxToken(conn.refresh_token);
    await updateCloudConnectionTokens(conn.id, refreshed);
    return { accessToken: refreshed.access_token, connectionId: conn.id };
  }
  return { accessToken: conn.access_token, connectionId: conn.id };
}

export interface DropboxEntry {
  '.tag': 'file' | 'folder' | 'deleted';
  id: string;
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  client_modified?: string;
  server_modified?: string;
}

export async function listDropboxFolder(opts: {
  accessToken: string;
  path?: string;
  cursor?: string;
  videosOnly?: boolean;
}): Promise<{ entries: DropboxEntry[]; cursor?: string; hasMore: boolean }> {
  const endpoint = opts.cursor
    ? `${DROPBOX_API}/files/list_folder/continue`
    : `${DROPBOX_API}/files/list_folder`;

  const body = opts.cursor
    ? { cursor: opts.cursor }
    : {
        path: opts.path && opts.path !== '/' ? opts.path : '',
        recursive: false,
        include_media_info: true,
        limit: 100,
      };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Dropbox list failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  let entries = data.entries as DropboxEntry[];
  if (opts.videosOnly) {
    entries = entries.filter((e) => {
      if (e['.tag'] === 'folder') return true;
      if (e['.tag'] !== 'file') return false;
      const ext = e.name.split('.').pop()?.toLowerCase();
      return ext ? VIDEO_EXTS.includes(ext) : false;
    });
  }
  return { entries, cursor: data.cursor, hasMore: !!data.has_more };
}

export async function downloadDropboxFile(opts: {
  accessToken: string;
  path: string;
}): Promise<{ stream: ReadableStream<Uint8Array>; contentLength: number }> {
  const res = await fetch(`${DROPBOX_CONTENT}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: opts.path }),
    },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Dropbox download failed: ${res.status} ${await res.text()}`);
  }
  return {
    stream: res.body,
    contentLength: Number(res.headers.get('content-length') ?? 0),
  };
}
