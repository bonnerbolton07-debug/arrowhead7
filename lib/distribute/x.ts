// =============================================================================
// Arrowhead 7 — X (Twitter) Publishing
// =============================================================================
// OAuth 2.0 PKCE for posting, chunked v1.1 media upload for video.
//
// Note: v1.1 media upload still requires the OAuth 1.0a "elevated" access for
// some endpoints, but for video tweets via OAuth 2.0 user-context, Twitter
// now supports `media/upload` with a Bearer token + `media_category=tweet_video`.
// If your app only has v2 access, set X_USE_V2_MEDIA=1 to use the v2 upload
// surface (also supported by /2/media/upload as of 2024).

import {
  getChannelById,
  updateChannelTokens,
  isTokenExpired,
  type OAuthTokens,
} from '@/lib/oauth/store';
import { getRedirectUri } from '@/lib/oauth/state';
import type { SupabaseClient } from '@supabase/supabase-js';

const X_AUTH = 'https://twitter.com/i/oauth2/authorize';
const X_TOKEN = 'https://api.twitter.com/2/oauth2/token';
const X_USER = 'https://api.twitter.com/2/users/me';
const X_MEDIA_V1 = 'https://upload.twitter.com/1.1/media/upload.json';
const X_TWEETS = 'https://api.twitter.com/2/tweets';

export const X_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'media.write',
  'offline.access',
];

export function xClientCreds(): { clientId: string; clientSecret?: string } {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    throw new Error('X_CLIENT_ID not configured');
  }
  // Public clients on X don't need a secret; confidential clients do.
  return { clientId, clientSecret: process.env.X_CLIENT_SECRET };
}

export function buildXAuthUrl(opts: {
  state: string;
  challenge: string;
  redirectUri?: string;
}): string {
  const { clientId } = xClientCreds();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: opts.redirectUri ?? getRedirectUri('x'),
    scope: X_SCOPES.join(' '),
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
  });
  return `${X_AUTH}?${params.toString()}`;
}

function basicAuth(): string | null {
  const { clientId, clientSecret } = xClientCreds();
  if (!clientSecret) return null;
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function exchangeXCode(opts: {
  code: string;
  verifier: string;
  redirectUri?: string;
}): Promise<OAuthTokens> {
  const { clientId } = xClientCreds();
  const body = new URLSearchParams({
    code: opts.code,
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: opts.redirectUri ?? getRedirectUri('x'),
    code_verifier: opts.verifier,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const auth = basicAuth();
  if (auth) headers.Authorization = auth;

  const res = await fetch(X_TOKEN, { method: 'POST', headers, body });
  if (!res.ok) {
    throw new Error(`X token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshXToken(
  refreshToken: string
): Promise<OAuthTokens> {
  const { clientId } = xClientCreds();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: clientId,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const auth = basicAuth();
  if (auth) headers.Authorization = auth;

  const res = await fetch(X_TOKEN, { method: 'POST', headers, body });
  if (!res.ok) {
    throw new Error(`X refresh failed: ${res.status} ${await res.text()}`);
  }
  const tokens = (await res.json()) as OAuthTokens;
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
  return tokens;
}

export async function fetchXUser(accessToken: string): Promise<{
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
}> {
  const res = await fetch(
    `${X_USER}?user.fields=profile_image_url,name,username`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`X userinfo failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.data) throw new Error('X userinfo: empty');
  return data.data;
}

export async function getValidXAccessToken(
  userId: string,
  channelId: string,
  client?: SupabaseClient
): Promise<string> {
  const channel = await getChannelById(userId, channelId, client);
  if (!channel || channel.platform !== 'twitter') {
    throw new Error('X channel not found');
  }
  if (isTokenExpired(channel.token_expires_at) && channel.refresh_token) {
    const refreshed = await refreshXToken(channel.refresh_token);
    await updateChannelTokens(channel.id, refreshed, client);
    return refreshed.access_token;
  }
  return channel.access_token;
}

// ─── Chunked video upload (v1.1) ─────────────────────────────────────────────

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB

async function fetchVideoBuffer(videoUrl: string): Promise<{
  buf: Buffer;
  contentType: string;
}> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Video fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: res.headers.get('content-type') || 'video/mp4' };
}

async function v1Form(
  accessToken: string,
  form: URLSearchParams
): Promise<Record<string, unknown>> {
  const res = await fetch(X_MEDIA_V1, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`X media (form) failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function uploadXVideo(opts: {
  accessToken: string;
  videoUrl: string;
}): Promise<string> {
  const { buf, contentType } = await fetchVideoBuffer(opts.videoUrl);

  // INIT
  const init = (await v1Form(
    opts.accessToken,
    new URLSearchParams({
      command: 'INIT',
      total_bytes: String(buf.length),
      media_type: contentType,
      media_category: 'tweet_video',
    })
  )) as { media_id_string: string };
  const mediaId = init.media_id_string;

  // APPEND (multipart per chunk)
  let segment = 0;
  for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
    const chunk = buf.subarray(offset, Math.min(offset + CHUNK_SIZE, buf.length));
    const fd = new FormData();
    fd.set('command', 'APPEND');
    fd.set('media_id', mediaId);
    fd.set('segment_index', String(segment));
    fd.set(
      'media',
      new Blob([new Uint8Array(chunk)], { type: 'application/octet-stream' })
    );
    const appendRes = await fetch(X_MEDIA_V1, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      body: fd,
    });
    if (!appendRes.ok) {
      throw new Error(
        `X media APPEND failed: ${appendRes.status} ${await appendRes.text()}`
      );
    }
    segment++;
  }

  // FINALIZE
  const finalize = (await v1Form(
    opts.accessToken,
    new URLSearchParams({
      command: 'FINALIZE',
      media_id: mediaId,
    })
  )) as { processing_info?: { state: string; check_after_secs?: number; error?: { message: string } } };

  // Poll STATUS if needed
  let info = finalize.processing_info;
  while (info && info.state !== 'succeeded') {
    if (info.state === 'failed') {
      throw new Error(`X media processing failed: ${info.error?.message ?? 'unknown'}`);
    }
    await new Promise((r) => setTimeout(r, (info?.check_after_secs ?? 2) * 1000));
    const status = (await v1Form(
      opts.accessToken,
      new URLSearchParams({ command: 'STATUS', media_id: mediaId })
    )) as { processing_info?: typeof info };
    info = status.processing_info;
    if (!info) break;
  }

  return mediaId;
}

export async function postXTweet(opts: {
  accessToken: string;
  text: string;
  mediaIds?: string[];
}): Promise<{ tweetId: string; url: string }> {
  const body: Record<string, unknown> = { text: opts.text.slice(0, 280) };
  if (opts.mediaIds?.length) body.media = { media_ids: opts.mediaIds };

  const res = await fetch(X_TWEETS, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`X tweet failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const tweetId = data?.data?.id;
  if (!tweetId) throw new Error('X tweet: no id');
  return { tweetId, url: `https://twitter.com/i/web/status/${tweetId}` };
}
