// =============================================================================
// Arrowhead 7 — YouTube Publishing
// =============================================================================
// Reuses Google OAuth (see lib/cloud/google-drive.ts) with the youtube.upload
// scope. Uses YouTube Data API v3 resumable uploads.

import {
  exchangeGoogleCode,
  refreshGoogleToken,
  fetchGoogleUserInfo,
  buildGoogleAuthUrl,
  YOUTUBE_SCOPES,
} from '@/lib/cloud/google-drive';
import {
  getChannelById,
  updateChannelTokens,
  isTokenExpired,
} from '@/lib/oauth/store';
import type { SupabaseClient } from '@supabase/supabase-js';

export { exchangeGoogleCode as exchangeYouTubeCode };
export { fetchGoogleUserInfo as fetchYouTubeUserInfo };

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';

export function buildYouTubeAuthUrl(state: string): string {
  return buildGoogleAuthUrl({
    provider: 'youtube',
    scopes: YOUTUBE_SCOPES,
    state,
  });
}

export async function getValidYouTubeAccessToken(
  userId: string,
  channelId: string,
  client?: SupabaseClient
): Promise<string> {
  const channel = await getChannelById(userId, channelId, client);
  if (!channel || channel.platform !== 'youtube') {
    throw new Error('YouTube channel not found');
  }
  if (isTokenExpired(channel.token_expires_at) && channel.refresh_token) {
    const refreshed = await refreshGoogleToken(channel.refresh_token);
    await updateChannelTokens(channel.id, refreshed, client);
    return refreshed.access_token;
  }
  return channel.access_token;
}

export async function fetchYouTubeChannel(accessToken: string): Promise<{
  id: string;
  title: string;
  thumbnailUrl?: string;
}> {
  const res = await fetch(
    `${YT_API}/channels?part=snippet&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`YouTube channel fetch failed: ${res.status}`);
  }
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error('No YouTube channel on this Google account');
  return {
    id: item.id,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.default?.url,
  };
}

export interface YouTubeUploadOpts {
  accessToken: string;
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
}

export interface YouTubeUploadResult {
  videoId: string;
  uploadStatus: string;
  privacyStatus: string;
}

/**
 * Pulls the source video from R2 (or any HTTPS URL) and streams it into the
 * YouTube resumable upload session.
 */
export async function uploadYouTubeVideo(
  opts: YouTubeUploadOpts
): Promise<YouTubeUploadResult> {
  const meta = {
    snippet: {
      title: opts.title.slice(0, 100),
      description: (opts.description ?? '').slice(0, 5000),
      tags: opts.tags?.slice(0, 30) ?? [],
      categoryId: opts.categoryId ?? '22',
    },
    status: { privacyStatus: opts.privacyStatus ?? 'private' },
  };

  const sourceHead = await fetch(opts.videoUrl, { method: 'HEAD' });
  if (!sourceHead.ok) {
    throw new Error(`Source video not reachable: ${sourceHead.status}`);
  }
  const contentLength = Number(sourceHead.headers.get('content-length') ?? 0);
  const contentType = sourceHead.headers.get('content-type') || 'video/mp4';

  const initRes = await fetch(
    `${YT_UPLOAD}?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        ...(contentLength
          ? { 'X-Upload-Content-Length': String(contentLength) }
          : {}),
      },
      body: JSON.stringify(meta),
    }
  );
  if (!initRes.ok) {
    throw new Error(`YouTube init failed: ${initRes.status} ${await initRes.text()}`);
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL');

  const sourceRes = await fetch(opts.videoUrl);
  if (!sourceRes.ok || !sourceRes.body) {
    throw new Error(`Source video fetch failed: ${sourceRes.status}`);
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      ...(contentLength ? { 'Content-Length': String(contentLength) } : {}),
    },
    body: sourceRes.body,
    // @ts-expect-error — duplex is required by Node fetch when streaming bodies
    duplex: 'half',
  });
  if (!uploadRes.ok) {
    throw new Error(`YouTube upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const body = await uploadRes.json();
  return {
    videoId: body.id,
    uploadStatus: body.status?.uploadStatus ?? 'uploaded',
    privacyStatus: body.status?.privacyStatus ?? meta.status.privacyStatus,
  };
}

export async function setYouTubeThumbnail(opts: {
  accessToken: string;
  videoId: string;
  thumbnailUrl: string;
}): Promise<void> {
  const imgRes = await fetch(opts.thumbnailUrl);
  if (!imgRes.ok) return; // best-effort
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(opts.videoId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': contentType,
      },
      body: buf,
    }
  );
}

export async function getYouTubeVideoStatus(opts: {
  accessToken: string;
  videoId: string;
}): Promise<{
  uploadStatus: string;
  processingStatus?: string;
  privacyStatus: string;
  publicUrl: string;
  failureReason?: string;
}> {
  const res = await fetch(
    `${YT_API}/videos?part=status,processingDetails&id=${encodeURIComponent(opts.videoId)}`,
    { headers: { Authorization: `Bearer ${opts.accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`YouTube status failed: ${res.status}`);
  }
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error('Video not found');
  return {
    uploadStatus: item.status?.uploadStatus,
    processingStatus: item.processingDetails?.processingStatus,
    privacyStatus: item.status?.privacyStatus,
    publicUrl: `https://www.youtube.com/watch?v=${opts.videoId}`,
    failureReason: item.status?.failureReason,
  };
}
