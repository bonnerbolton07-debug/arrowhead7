// =============================================================================
// Arrowhead 7 — Instagram Reels Publishing (Facebook Graph API)
// =============================================================================
// Requires a Facebook Business app, an Instagram Business / Creator account
// linked to a Facebook Page, and `instagram_content_publish` permission.
//
// Flow:
//   1) /me/accounts            → page access token + IG business account ID
//   2) /{ig-user-id}/media     → upload container (media_type=REELS, video_url)
//   3) poll container status   → FINISHED
//   4) /{ig-user-id}/media_publish → publish container

import {
  getChannelById,
  updateChannelTokens,
  isTokenExpired,
  type OAuthTokens,
} from '@/lib/oauth/store';
import { getRedirectUri } from '@/lib/oauth/state';
import type { SupabaseClient } from '@supabase/supabase-js';

const FB_AUTH = 'https://www.facebook.com/v19.0/dialog/oauth';
const FB_TOKEN = 'https://graph.facebook.com/v19.0/oauth/access_token';
const FB_API = 'https://graph.facebook.com/v19.0';

export const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

export function fbClientCreds(): { appId: string; appSecret: string } {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not configured');
  }
  return { appId, appSecret };
}

export function buildInstagramAuthUrl(state: string, redirectUri = getRedirectUri('instagram')): string {
  const { appId } = fbClientCreds();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state,
  });
  return `${FB_AUTH}?${params.toString()}`;
}

export async function exchangeInstagramCode(
  code: string,
  redirectUri = getRedirectUri('instagram')
): Promise<OAuthTokens> {
  const { appId, appSecret } = fbClientCreds();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${FB_TOKEN}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Instagram token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function exchangeForLongLivedToken(
  shortAccessToken: string
): Promise<OAuthTokens> {
  const { appId, appSecret } = fbClientCreds();
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortAccessToken,
  });
  const res = await fetch(`${FB_TOKEN}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Instagram long-lived token failed: ${res.status}`);
  }
  return res.json();
}

export interface InstagramAccount {
  ig_user_id: string;
  username?: string;
  profile_picture_url?: string;
  page_id: string;
  page_access_token: string;
}

/**
 * Discover the first IG Business account connected to one of the user's pages.
 */
export async function findInstagramAccount(
  userAccessToken: string
): Promise<InstagramAccount | null> {
  const pagesRes = await fetch(
    `${FB_API}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userAccessToken)}`
  );
  if (!pagesRes.ok) return null;
  const pages = await pagesRes.json();
  for (const page of pages.data ?? []) {
    const igRef = page.instagram_business_account?.id;
    if (!igRef) continue;
    const igRes = await fetch(
      `${FB_API}/${igRef}?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(page.access_token)}`
    );
    if (!igRes.ok) continue;
    const ig = await igRes.json();
    return {
      ig_user_id: ig.id,
      username: ig.username,
      profile_picture_url: ig.profile_picture_url,
      page_id: page.id,
      page_access_token: page.access_token,
    };
  }
  return null;
}

export async function getValidInstagramAccess(
  userId: string,
  channelId: string,
  client?: SupabaseClient
): Promise<{ pageAccessToken: string; igUserId: string }> {
  const channel = await getChannelById(userId, channelId, client);
  if (!channel || channel.platform !== 'instagram') {
    throw new Error('Instagram channel not found');
  }
  if (isTokenExpired(channel.token_expires_at) && channel.refresh_token) {
    // FB long-lived tokens are refreshed by re-exchanging.
    const refreshed = await exchangeForLongLivedToken(channel.access_token);
    await updateChannelTokens(channel.id, refreshed, client);
    return {
      pageAccessToken: refreshed.access_token,
      igUserId: channel.platform_account_id,
    };
  }
  return {
    pageAccessToken: channel.access_token,
    igUserId: channel.platform_account_id,
  };
}

export async function publishInstagramReel(opts: {
  pageAccessToken: string;
  igUserId: string;
  videoUrl: string; // must be public HTTPS
  caption: string;
  thumbnailUrl?: string;
}): Promise<{ mediaId: string; permalink?: string }> {
  // 1) Create media container.
  const containerParams = new URLSearchParams({
    media_type: 'REELS',
    video_url: opts.videoUrl,
    caption: opts.caption,
    access_token: opts.pageAccessToken,
  });
  if (opts.thumbnailUrl) containerParams.set('thumb_offset', '0');

  const createRes = await fetch(`${FB_API}/${opts.igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: containerParams,
  });
  if (!createRes.ok) {
    throw new Error(`Instagram container failed: ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const containerId = created.id as string;

  // 2) Poll status until FINISHED (max ~90s).
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `${FB_API}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(opts.pageAccessToken)}`
    );
    if (!statusRes.ok) continue;
    const s = await statusRes.json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new Error(`Instagram processing failed: ${s.status ?? s.status_code}`);
    }
  }

  // 3) Publish.
  const publishRes = await fetch(`${FB_API}/${opts.igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: opts.pageAccessToken,
    }),
  });
  if (!publishRes.ok) {
    throw new Error(`Instagram publish failed: ${publishRes.status} ${await publishRes.text()}`);
  }
  const published = await publishRes.json();
  const mediaId = published.id as string;

  // 4) Fetch permalink (best-effort).
  let permalink: string | undefined;
  try {
    const permRes = await fetch(
      `${FB_API}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(opts.pageAccessToken)}`
    );
    if (permRes.ok) {
      const p = await permRes.json();
      permalink = p.permalink;
    }
  } catch {
    // ignore
  }
  return { mediaId, permalink };
}
