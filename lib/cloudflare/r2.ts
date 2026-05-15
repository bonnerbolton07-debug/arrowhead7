// =============================================================================
// Arrowhead 7 — Cloudflare R2 Storage Client
// =============================================================================
// Temporary processing storage for source videos and intermediate files.
// Final outputs go to Cloudflare Stream, not R2.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListObjectsV2Command,
  ListMultipartUploadsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || 'arrowhead7-processing';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 is not configured. Missing CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY.');
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * R2 client using S3-compatible API.
 */
function getR2Client(): S3Client {
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// ─── Upload ──────────────────────────────────────────────────────────────────

/**
 * Upload a file to R2.
 * Returns the R2 object key.
 */
export async function uploadToR2(
  key: string,
  body: Buffer | ReadableStream | Blob,
  contentType: string
): Promise<string> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body as any,
    ContentType: contentType,
  }));

  return key;
}

/**
 * Generate a presigned upload URL for direct client uploads.
 * Avoids routing large video files through our server.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Generate a presigned download URL.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/**
 * Delete a file from R2.
 * Called after render is complete and video is on Cloudflare Stream.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();

  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
}

// ─── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generate a unique R2 key for source media uploads.
 */
export function generateSourceKey(userId: string, editId: string, filename: string): string {
  const ext = safeExtension(filename, 'mp4');
  return `sources/${userId}/${editId}/${randomUUID()}.${ext}`;
}

/**
 * Generate a key for intermediate processing files.
 */
export function generateProcessingKey(editId: string, step: string): string {
  return `processing/${editId}/${step}`;
}

/**
 * Generate a key for reference media used by Style DNA.
 * Keys land under `references/` so the analyzer can recognise them.
 */
export function generateReferenceMediaKey(userId: string, editId: string, filename: string): string {
  const ext = safeExtension(filename, 'jpg');
  const slug = randomUUID();
  return `references/${userId}/${editId}/${slug}.${ext}`;
}

// ─── Multipart upload (large files) ──────────────────────────────────────────
// R2 implements the S3 multipart-upload API. For files larger than ~25MB we
// split client-side into ~5MB parts and upload each part to its own presigned
// URL in parallel — multiple TCP connections in flight is dramatically faster
// than a single PUT, especially on mobile networks where each connection's
// throughput is capped low.

export interface MultipartCreateResult {
  uploadId: string;
  key: string;
}

/** Start a multipart upload and return the uploadId. */
export async function createMultipartUpload(
  key: string,
  contentType: string
): Promise<MultipartCreateResult> {
  const client = getR2Client();
  const { bucket } = getR2Config();
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    })
  );
  if (!result.UploadId) throw new Error('R2 did not return an UploadId');
  return { uploadId: result.UploadId, key };
}

/** Presign one UploadPart request so the client can PUT the chunk directly. */
export async function getPresignedUploadPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getR2Client();
  const { bucket } = getR2Config();
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** Complete a multipart upload once every part has finished PUTing. */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
}

/** Abort a multipart upload — releases the partial parts. Best-effort. */
export async function abortMultipartUpload(
  key: string,
  uploadId: string
): Promise<void> {
  const client = getR2Client();
  const { bucket } = getR2Config();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    })
  );
}

// ─── Lifecycle cleanup ───────────────────────────────────────────────────────
// R2 does not expire incomplete multipart uploads or transient processing
// files on its own, so both leak storage indefinitely. `purgeStaleR2` is run
// on a cron (see app/api/cleanup/r2/route.ts) to reclaim that space.

/** Default staleness window — anything older than this is eligible for purge. */
const R2_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface PendingMultipartUpload {
  key: string;
  uploadId: string;
  initiated?: Date;
}

/** List in-progress (incomplete) multipart uploads in the bucket. */
export async function listMultipartUploads(max = 1000): Promise<PendingMultipartUpload[]> {
  const client = getR2Client();
  const { bucket } = getR2Config();
  const out: PendingMultipartUpload[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  do {
    const res = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      })
    );
    for (const up of res.Uploads ?? []) {
      if (up.Key && up.UploadId) {
        out.push({ key: up.Key, uploadId: up.UploadId, initiated: up.Initiated });
        if (out.length >= max) break;
      }
    }
    if (res.IsTruncated && out.length < max) {
      keyMarker = res.NextKeyMarker;
      uploadIdMarker = res.NextUploadIdMarker;
    } else {
      keyMarker = undefined;
      uploadIdMarker = undefined;
    }
  } while (keyMarker && out.length < max);
  return out;
}

export interface R2CleanupResult {
  scannedUploads: number;
  abortedUploads: number;
  scannedObjects: number;
  deletedObjects: number;
}

/**
 * Purge abandoned multipart uploads and stale `processing/` intermediate files
 * older than `olderThanMs`. Conservative: an upload/object with no usable
 * timestamp is left alone rather than risk killing an in-flight resumable
 * upload. Individual failures are logged and skipped — one bad key never
 * aborts the whole sweep.
 */
export async function purgeStaleR2(olderThanMs = R2_STALE_AFTER_MS): Promise<R2CleanupResult> {
  const cutoff = Date.now() - olderThanMs;
  const result: R2CleanupResult = {
    scannedUploads: 0,
    abortedUploads: 0,
    scannedObjects: 0,
    deletedObjects: 0,
  };

  const uploads = await listMultipartUploads();
  result.scannedUploads = uploads.length;
  for (const up of uploads) {
    const initiated = up.initiated ? up.initiated.getTime() : 0;
    if (!initiated || initiated > cutoff) continue;
    try {
      await abortMultipartUpload(up.key, up.uploadId);
      result.abortedUploads++;
    } catch (err) {
      console.error('[r2:cleanup] abort multipart upload failed', {
        key: up.key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const processing = await listR2('processing/');
  result.scannedObjects = processing.length;
  for (const obj of processing) {
    const modified = obj.lastModified ? obj.lastModified.getTime() : 0;
    if (!modified || modified > cutoff) continue;
    try {
      await deleteFromR2(obj.key);
      result.deletedObjects++;
    } catch (err) {
      console.error('[r2:cleanup] delete stale object failed', {
        key: obj.key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ─── User Vault Keys ─────────────────────────────────────────────────────────
// All persistent user content lives under `users/{uid}/vault/{folder}/...`.
// `references/` and `footage/` are user-uploaded; `exports/` holds finished
// renders that we copy out of Cloudflare Stream / Shotstack output.

export type VaultFolder = 'references' | 'footage' | 'exports';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

function randomSlug(): string {
  return randomUUID();
}

function safeExtension(filename: string, fallback: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || fallback;
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}

export function generateVaultKey(
  userId: string,
  folder: VaultFolder,
  filename: string
): string {
  const safe = sanitizeFilename(filename);
  const slug = randomSlug();
  // `references/<slug>_<name>.ext` keeps names readable while avoiding collisions
  return `users/${userId}/vault/${folder}/${slug}_${safe}`;
}

export function parseVaultKey(
  key: string
): { userId: string; folder: VaultFolder; filename: string } | null {
  const m = key.match(/^users\/([^/]+)\/vault\/(references|footage|exports)\/(.+)$/);
  if (!m) return null;
  return {
    userId: m[1],
    folder: m[2] as VaultFolder,
    filename: m[3],
  };
}

/**
 * Parse an editor source/reference media key — the `sources/{uid}/{editId}/...`
 * and `references/{uid}/{editId}/...` keys produced by `generateSourceKey` /
 * `generateReferenceMediaKey`. These predate the vault path scheme but still
 * need to be registered into the vault index after upload, so vault/register
 * accepts them via this parser.
 */
export function parseEditorMediaKey(
  key: string
): { userId: string; editId: string; filename: string } | null {
  const m = key.match(/^(sources|references)\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return {
    userId: m[2],
    editId: m[3],
    filename: m[4],
  };
}

// ─── List & Head ─────────────────────────────────────────────────────────────

export interface R2Object {
  key: string;
  size: number;
  lastModified?: Date;
}

export async function listR2(prefix: string, max = 1000): Promise<R2Object[]> {
  const client = getR2Client();
  const { bucket } = getR2Config();
  const out: R2Object[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: Math.min(1000, max - out.length),
      })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) {
        out.push({
          key: obj.Key,
          size: typeof obj.Size === 'number' ? obj.Size : 0,
          lastModified: obj.LastModified,
        });
        if (out.length >= max) break;
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken && out.length < max);
  return out;
}

export async function headR2(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const client = getR2Client();
    const { bucket } = getR2Config();
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      size: typeof res.ContentLength === 'number' ? res.ContentLength : 0,
      contentType: res.ContentType,
    };
  } catch {
    return null;
  }
}
