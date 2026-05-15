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
 * Generate a unique R2 key for a source video upload.
 */
export function generateSourceKey(userId: string, editId: string, filename: string): string {
  const ext = safeExtension(filename, 'mp4');
  return `sources/${userId}/${editId}/source.${ext}`;
}

/**
 * Generate a key for intermediate processing files.
 */
export function generateProcessingKey(editId: string, step: string): string {
  return `processing/${editId}/${step}`;
}

/**
 * Generate a key for a mood-board reference image used by Style DNA.
 * Keys land under `references/` so the analyzer can recognise them.
 */
export function generateReferenceImageKey(userId: string, editId: string, filename: string): string {
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

/**
 * TODO: Implement lifecycle rules to auto-delete processing files after 24h.
 * R2 supports lifecycle policies via the dashboard or API.
 */

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
