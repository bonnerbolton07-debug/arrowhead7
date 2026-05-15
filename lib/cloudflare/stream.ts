// =============================================================================
// Arrowhead 7 — Cloudflare Stream Client
// =============================================================================
// Video hosting and delivery via Cloudflare Stream.
// Rendered outputs get uploaded here for playback.

function getStreamConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Stream is not configured. Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN.');
  }
  return {
    accountId,
    apiToken,
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
  };
}

function getHeaders(json = false): Record<string, string> {
  const { apiToken } = getStreamConfig();
  const h: Record<string, string> = { Authorization: `Bearer ${apiToken}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

/**
 * Upload a video to Cloudflare Stream from a URL.
 * Used after Shotstack renders — pull the output directly into Stream.
 */
export async function uploadFromUrl(
  videoUrl: string,
  meta?: { name?: string; editId?: string }
): Promise<{ uid: string; playbackUrl: string; thumbnailUrl: string }> {
  const { accountId, baseUrl } = getStreamConfig();
  const response = await fetch(`${baseUrl}/copy`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({
      url: videoUrl,
      meta: meta || {},
      requireSignedURLs: false,  // TODO: Enable for premium content
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stream upload failed: ${response.status} — ${error}`);
  }

  const data = await response.json();
  const video = data.result;

  return {
    uid: video.uid,
    playbackUrl: `https://customer-${accountId}.cloudflarestream.com/${video.uid}/manifest/video.m3u8`,
    thumbnailUrl: `https://customer-${accountId}.cloudflarestream.com/${video.uid}/thumbnails/thumbnail.jpg`,
  };
}

/**
 * Get a TUS upload URL for direct browser uploads.
 * TODO: Implement for large file uploads from client.
 */
export async function getTusUploadUrl(
  maxDurationSeconds: number,
  meta?: Record<string, string>
): Promise<string> {
  const { baseUrl } = getStreamConfig();
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      ...getHeaders(),
      'Tus-Resumable': '1.0.0',
      'Upload-Length': '0', // Will be set by client
      'Upload-Metadata': meta
        ? Object.entries(meta).map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`).join(',')
        : '',
    },
  });

  if (!response.ok) {
    throw new Error(`Stream TUS init failed: ${response.status}`);
  }

  return response.headers.get('Location') || '';
}

// ─── Playback ────────────────────────────────────────────────────────────────

/**
 * Get video details from Cloudflare Stream.
 */
export async function getVideoDetails(uid: string): Promise<{
  uid: string;
  status: string;
  duration: number;
  readyToStream: boolean;
  playbackUrl: string;
  thumbnailUrl: string;
  size: number;
}> {
  const { accountId, baseUrl } = getStreamConfig();
  const response = await fetch(`${baseUrl}/${uid}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Stream details failed: ${response.status}`);
  }

  const data = await response.json();
  const video = data.result;

  return {
    uid: video.uid,
    status: video.status?.state || 'unknown',
    duration: video.duration || 0,
    readyToStream: video.readyToStream || false,
    playbackUrl: `https://customer-${accountId}.cloudflarestream.com/${video.uid}/manifest/video.m3u8`,
    thumbnailUrl: `https://customer-${accountId}.cloudflarestream.com/${video.uid}/thumbnails/thumbnail.jpg`,
    size: video.size || 0,
  };
}

/**
 * Generate an embed iframe URL for a Stream video.
 */
export function getEmbedUrl(uid: string, options?: {
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
}): string {
  const params = new URLSearchParams();
  if (options?.autoplay) params.set('autoplay', 'true');
  if (options?.muted) params.set('muted', 'true');
  if (options?.loop) params.set('loop', 'true');
  if (options?.controls === false) params.set('controls', 'false');

  const query = params.toString();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('Cloudflare Stream is not configured. Missing CLOUDFLARE_ACCOUNT_ID.');
  return `https://customer-${accountId}.cloudflarestream.com/${uid}/iframe${query ? `?${query}` : ''}`;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/**
 * Delete a video from Cloudflare Stream.
 */
export async function deleteVideo(uid: string): Promise<void> {
  const { baseUrl } = getStreamConfig();
  const response = await fetch(`${baseUrl}/${uid}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Stream delete failed: ${response.status}`);
  }
}
