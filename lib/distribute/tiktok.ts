// =============================================================================
// Arrowhead 7 — TikTok Content Posting API
// =============================================================================
// OAuth + init/upload/publish for direct posts (rendered videos). Uses
// FILE_UPLOAD when we have an HTTPS source, with PULL_FROM_URL as a
// faster fallback for publicly reachable Cloudflare Stream MP4s.

import {
  getChannelById,
  updateChannelTokens,
  isTokenExpired,
  type OAuthTokens,
} from '@/lib/oauth/store';
import { getRedirectUri } from '@/lib/oauth/state';
import type { SupabaseClient } from '@supabase/supabase-js';

const TIKTOK_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER = 'https://open.tiktokapis.com/v2/user/info/';
const TIKTOK_INIT_PULL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const TIKTOK_STATUS = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

export const TIKTOK_SCOPES = [
  'user.info.basic',
  'video.publish',
  'video.upload',
];

export function tiktokClientCreds(): { clientKey: string; clientSecret: string } {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not configured');
  }
  return { clientKey, clientSecret };
}

export function buildTikTokAuthUrl(state: string): string {
  const { clientKey } = tiktokClientCreds();
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: TIKTOK_SCOPES.join(','),
    redirect_uri: getRedirectUri('tiktok'),
    state,
  });
  return `${TIKTOK_AUTH}?${params.toString()}`;
}

export async function exchangeTikTokCode(code: string): Promise<OAuthTokens & {
  open_id: string;
}> {
  const { clientKey, clientSecret } = tiktokClientCreds();
  const res = await fetch(TIKTOK_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri('tiktok'),
    }),
  });
  if (!res.ok) {
    throw new Error(`TikTok token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshTikTokToken(
  refreshToken: string
): Promise<OAuthTokens> {
  const { clientKey, clientSecret } = tiktokClientCreds();
  const res = await fetch(TIKTOK_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`TikTok refresh failed: ${res.status} ${await res.text()}`);
  }
  const tokens = (await res.json()) as OAuthTokens;
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
  return tokens;
}

export async function fetchTikTokUser(accessToken: string): Promise<{
  open_id: string;
  display_name?: string;
  avatar_url?: string;
}> {
  const res = await fetch(
    `${TIKTOK_USER}?fields=open_id,display_name,avatar_url`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`TikTok userinfo failed: ${res.status}`);
  }
  const data = await res.json();
  const u = data.data?.user;
  if (!u) throw new Error('TikTok userinfo: no user');
  return u;
}

export async function getValidTikTokAccessToken(
  userId: string,
  channelId: string,
  client?: SupabaseClient
): Promise<string> {
  const channel = await getChannelById(userId, channelId, client);
  if (!channel || channel.platform !== 'tiktok') {
    throw new Error('TikTok channel not found');
  }
  if (isTokenExpired(channel.token_expires_at) && channel.refresh_token) {
    const refreshed = await refreshTikTokToken(channel.refresh_token);
    await updateChannelTokens(channel.id, refreshed, client);
    return refreshed.access_token;
  }
  return channel.access_token;
}

export interface TikTokPostOpts {
  accessToken: string;
  videoUrl: string; // must be HTTPS, verified domain for PULL_FROM_URL
  title: string;
  privacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export async function postTikTokFromUrl(
  opts: TikTokPostOpts
): Promise<{ publishId: string }> {
  const body = {
    post_info: {
      title: opts.title.slice(0, 150),
      privacy_level: opts.privacy ?? 'SELF_ONLY',
      disable_duet: !!opts.disableDuet,
      disable_comment: !!opts.disableComment,
      disable_stitch: !!opts.disableStitch,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: opts.videoUrl,
    },
  };
  const res = await fetch(TIKTOK_INIT_PULL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`TikTok publish init failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const publishId = data?.data?.publish_id;
  if (!publishId) {
    throw new Error(`TikTok publish init: no publish_id (${JSON.stringify(data)})`);
  }
  return { publishId };
}

export async function getTikTokPublishStatus(opts: {
  accessToken: string;
  publishId: string;
}): Promise<{
  status: string;
  publicalyAvailablePostId?: string;
  failReason?: string;
}> {
  const res = await fetch(TIKTOK_STATUS, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: opts.publishId }),
  });
  if (!res.ok) {
    throw new Error(`TikTok status failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return {
    status: data?.data?.status ?? 'UNKNOWN',
    publicalyAvailablePostId: data?.data?.publicaly_available_post_id?.[0],
    failReason: data?.data?.fail_reason,
  };
}
