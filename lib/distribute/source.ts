// =============================================================================
// Arrowhead 7 — Resolve a video URL suitable for upload to social platforms
// =============================================================================
// Most platforms accept either an HTTPS URL (Instagram, TikTok PULL_FROM_URL)
// or a streaming upload (YouTube, X v1.1, TikTok FILE_UPLOAD). We prefer the
// rendered Cloudflare Stream MP4 download when available; otherwise we fall
// back to the raw R2 source via a presigned URL.

import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';

interface EditRow {
  output_video_url?: string | null;
  output_stream_uid?: string | null;
  source_video_url?: string | null;
}

/**
 * Public MP4 download URL on Cloudflare Stream.
 * Stream exposes /downloads/default.mp4 once an MP4 is enabled for the video.
 */
function streamDownloadUrl(uid: string): string {
  return `https://customer-${CF_ACCOUNT_ID}.cloudflarestream.com/${uid}/downloads/default.mp4`;
}

export async function resolveSourceVideoUrl(
  edit: EditRow
): Promise<string | null> {
  if (edit.output_stream_uid && CF_ACCOUNT_ID) {
    return streamDownloadUrl(edit.output_stream_uid);
  }
  if (edit.output_video_url && /^https?:\/\//.test(edit.output_video_url)) {
    return edit.output_video_url;
  }
  // Fall back to the source upload — useful when distributing the raw file
  // (e.g. quick reposts) without a render step.
  if (edit.source_video_url) {
    if (/^https?:\/\//.test(edit.source_video_url)) return edit.source_video_url;
    // Treat as R2 key
    try {
      return await getPresignedDownloadUrl(edit.source_video_url, 3600);
    } catch {
      return null;
    }
  }
  return null;
}
