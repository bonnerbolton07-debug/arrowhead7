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
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'arrowhead7-processing';

/**
 * R2 client using S3-compatible API.
 */
function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
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

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
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

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
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

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
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

  await client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  }));
}

// ─── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generate a unique R2 key for a source video upload.
 */
export function generateSourceKey(userId: string, editId: string, filename: string): string {
  const ext = filename.split('.').pop() || 'mp4';
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
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
  const slug = Math.random().toString(36).slice(2, 10);
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
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET,
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
  const command = new UploadPartCommand({
    Bucket: R2_BUCKET,
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
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
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
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      UploadId: uploadId,
    })
  );
}

/**
 * TODO: Implement lifecycle rules to auto-delete processing files after 24h.
 * R2 supports lifecycle policies via the dashboard or API.
 */
