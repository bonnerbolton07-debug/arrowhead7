// =============================================================================
// Arrowhead 7 — Vault-Pull Pipeline
// =============================================================================
// Server-to-server file transfer from a cloud provider to R2. Avoids buffering
// the entire video in Lambda memory by uploading the streamed body via the
// multipart S3 client. Keeps a running byte count so callers can report
// progress and abort on size-limit overruns.

import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';

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

// 8 MiB minimum part size for R2 multipart uploads.
const PART_SIZE = 8 * 1024 * 1024;
// 5 GB ceiling — enough for any phone-shot footage; protects Lambda budget.
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024 * 1024;

function r2(): S3Client {
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

export interface StreamToR2Result {
  key: string;
  bytes: number;
  contentType: string;
}

/**
 * Stream a ReadableStream into R2 using multipart upload.
 *
 * Each ~8 MiB of body bytes becomes one S3 UploadPart. We never hold the full
 * file in memory — the largest buffer at any moment is `PART_SIZE`.
 */
export async function streamToR2(opts: {
  key: string;
  contentType: string;
  stream: ReadableStream<Uint8Array>;
  maxBytes?: number;
  onProgress?: (bytes: number) => void;
}): Promise<StreamToR2Result> {
  const client = r2();
  const { bucket } = getR2Config();
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const create = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: opts.key,
      ContentType: opts.contentType,
    })
  );
  const uploadId = create.UploadId!;

  const parts: CompletedPart[] = [];
  let partNumber = 1;
  let totalBytes = 0;
  let buffer = new Uint8Array(0);

  const reader = opts.stream.getReader();

  async function flushPart(final: boolean): Promise<void> {
    if (buffer.length === 0) return;
    if (!final && buffer.length < PART_SIZE) return;
    const out = await client.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: opts.key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: buffer,
      })
    );
    parts.push({ ETag: out.ETag, PartNumber: partNumber });
    partNumber += 1;
    buffer = new Uint8Array(0);
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        throw new Error(
          `File exceeds ${(maxBytes / 1024 ** 3).toFixed(1)} GB limit`
        );
      }

      const merged = new Uint8Array(buffer.length + value.length);
      merged.set(buffer, 0);
      merged.set(value, buffer.length);
      buffer = merged;

      while (buffer.length >= PART_SIZE) {
        const chunk = buffer.slice(0, PART_SIZE);
        const out = await client.send(
          new UploadPartCommand({
            Bucket: bucket,
            Key: opts.key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: chunk,
          })
        );
        parts.push({ ETag: out.ETag, PartNumber: partNumber });
        partNumber += 1;
        buffer = buffer.slice(PART_SIZE);
        if (opts.onProgress) opts.onProgress(totalBytes);
      }
    }

    await flushPart(true);

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: opts.key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      })
    );

    return { key: opts.key, bytes: totalBytes, contentType: opts.contentType };
  } catch (err) {
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: opts.key,
          UploadId: uploadId,
        })
      );
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
}

/**
 * Fetch a publicly-reachable HTTPS URL and stream the response into R2. The
 * caller decides the destination key and content-type fallback. Used by the
 * iCloud share-link importer, the generic "import by URL" path, and any
 * provider that hands back a short-lived signed URL.
 */
export async function pullUrlToR2(opts: {
  url: string;
  key: string;
  fallbackContentType?: string;
  maxBytes?: number;
  authHeader?: string;
  onProgress?: (bytes: number) => void;
}): Promise<StreamToR2Result> {
  const res = await fetch(opts.url, {
    headers: opts.authHeader ? { Authorization: opts.authHeader } : undefined,
  });
  if (!res.ok || !res.body) {
    throw new Error(
      `Source fetch failed: ${res.status} ${res.statusText || ''}`.trim()
    );
  }
  const contentType =
    res.headers.get('content-type') ||
    opts.fallbackContentType ||
    'application/octet-stream';

  return streamToR2({
    key: opts.key,
    contentType,
    stream: res.body,
    maxBytes: opts.maxBytes,
    onProgress: opts.onProgress,
  });
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'video.mp4';
}

export function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    heic: 'image/heic',
  };
  return (ext && map[ext]) || 'application/octet-stream';
}
