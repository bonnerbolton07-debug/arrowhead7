// =============================================================================
// Arrowhead 7 — iCloud Drive (public share-link import)
// =============================================================================
// Apple discontinued WebDAV for iCloud in 2014. CloudKit JS — the only
// official remote-access API — requires a paid Apple Developer account and
// only exposes data your app itself wrote, not the user's existing Drive.
//
// What DOES work without Apple Developer credentials: iCloud Drive's public
// "share link" feature. The user shares a file or folder from the Files app
// (Share → Copy Link), pastes the URL into A7, and Apple's web frontend
// serves the file via its `ckdatabasews` JSON API. This module wraps that
// flow.
//
// Share-link URL shapes Apple uses:
//   https://www.icloud.com/iclouddrive/<shortToken>           (single file)
//   https://www.icloud.com/iclouddrive/<shortToken>#<name>    (named file)
//   https://share.icloud.com/photos/<token>                   (Photos share)
//
// The short-token form returns a small JSON envelope that contains the real
// container URL + a `download` field with a presigned download URL valid for
// a few minutes. We resolve through that and stream the bytes to R2.

const SHARE_DOMAINS = /(?:www\.icloud\.com|share\.icloud\.com)\//i;
const SHARE_TOKEN_PATH = /\/iclouddrive\/([A-Za-z0-9_-]+)/;
const RESOLVE_ENDPOINT_PATTERN = 'https://ckdatabasews.icloud.com/database/1/com.apple.cloudkit/production/public/records/resolve';

export interface ICloudResolveResult {
  /** Direct URL to fetch the file bytes from. Short-lived (~5 minutes). */
  downloadUrl: string;
  /** Best-effort file name from the share metadata. */
  name: string;
  /** Size in bytes when Apple reports it. */
  size?: number;
  /** MIME type. */
  contentType?: string;
}

export function isIcloudShareUrl(value: string): boolean {
  return SHARE_DOMAINS.test(value) && /iclouddrive|photos/.test(value);
}

export function extractShareToken(url: string): string | null {
  const m = url.match(SHARE_TOKEN_PATH);
  return m ? m[1] : null;
}

/**
 * Resolve an iCloud share URL to a direct downloadable URL using Apple's
 * public-records resolve endpoint. Apple's web app calls this same endpoint;
 * it doesn't require authentication for public shares.
 *
 * Notes:
 *  - The API requires the exact `shortGUIDs` envelope; mis-shaped requests
 *    return 400.
 *  - The download URL is signed and expires after a few minutes — callers
 *    must immediately stream the bytes rather than persisting the URL.
 *  - When the share is a folder, this returns the metadata for the first
 *    file inside the folder (callers should ask the user to share a single
 *    file for now). Folder browsing would require a second call to
 *    `retrieveItems`, which is structurally similar but iterative.
 */
export async function resolveIcloudShare(shareUrl: string): Promise<ICloudResolveResult> {
  if (!isIcloudShareUrl(shareUrl)) {
    throw new Error('Not an iCloud share URL');
  }
  const token = extractShareToken(shareUrl);
  if (!token) {
    throw new Error('Could not parse share token from iCloud URL');
  }

  const body = {
    shortGUIDs: [{ value: token }],
  };
  const res = await fetch(RESOLVE_ENDPOINT_PATTERN, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain', // Apple's API rejects application/json here
      Origin: 'https://www.icloud.com',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `iCloud resolve failed: ${res.status} (Apple's share-link API may have changed; ` +
        `if this persists, please download the file from iCloud and upload it directly.)`
    );
  }
  const data = (await res.json()) as {
    results?: Array<{
      rootRecord?: {
        recordName?: string;
        fields?: {
          fileName?: { value?: string };
          dataString?: { value?: string };
          [key: string]:
            | { value?: { downloadURL?: string; size?: number } | string }
            | undefined;
        };
      };
    }>;
  };

  const rec = data.results?.[0]?.rootRecord;
  if (!rec) throw new Error('iCloud share returned no record (link may have expired)');

  const fields = rec.fields ?? {};
  // The download URL lives under various field names depending on the asset
  // shape — Apple uses `fileContent`, `originalFile`, or `dataString` for
  // different file kinds. Scan for the first one that has a `downloadURL`.
  let downloadUrl: string | undefined;
  let size: number | undefined;
  for (const [, value] of Object.entries(fields)) {
    const v = value?.value;
    if (v && typeof v === 'object' && 'downloadURL' in v && typeof v.downloadURL === 'string') {
      downloadUrl = v.downloadURL;
      if (typeof v.size === 'number') size = v.size;
      break;
    }
  }
  if (!downloadUrl) {
    throw new Error(
      'iCloud share record has no downloadable asset. Make sure the link points to a file, not a folder.'
    );
  }

  const name = fields.fileName?.value ?? rec.recordName ?? 'icloud-file';
  return { downloadUrl, name, size };
}

/**
 * Stream the file bytes from an iCloud share URL. Caller is responsible for
 * pushing the stream to storage.
 */
export async function downloadIcloudShare(shareUrl: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
  name: string;
}> {
  const resolved = await resolveIcloudShare(shareUrl);
  const res = await fetch(resolved.downloadUrl);
  if (!res.ok || !res.body) {
    throw new Error(`iCloud download failed: ${res.status}`);
  }
  return {
    stream: res.body,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    contentLength: Number(res.headers.get('content-length') ?? resolved.size ?? 0),
    name: resolved.name,
  };
}
