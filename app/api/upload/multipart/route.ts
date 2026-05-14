// =============================================================================
// Arrowhead 7 — Multipart upload orchestration
// =============================================================================
// One endpoint that handles every step of an S3 multipart upload against R2.
// The client uses this for any file >25MB so uploads can run multiple parts
// in parallel — a single PUT through one TCP connection is the bottleneck
// on mobile uploads, not R2's ingest rate.
//
// Flow:
//   1. POST { action: 'create',   filename, contentType, kind? }
//      → { uploadId, key, editId }
//   2. POST { action: 'sign',     key, uploadId, partNumber }
//      → { url }                              (client PUTs the chunk)
//   3. POST { action: 'complete', key, uploadId, parts: [{ partNumber, etag }] }
//      → { ok: true }
//   4. POST { action: 'abort',    key, uploadId }
//      → { ok: true }

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  createMultipartUpload,
  getPresignedUploadPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  generateSourceKey,
  generateReferenceImageKey,
} from '@/lib/cloudflare/r2';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_VIDEO = new Set(['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']);
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const action = body?.action as string | undefined;

    switch (action) {
      case 'create': {
        const { filename, contentType, kind, editId } = body;
        if (!filename || !contentType) {
          return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
        }
        const isImage = kind === 'reference-image';
        const allowed = isImage ? ALLOWED_IMAGE : ALLOWED_VIDEO;
        if (!allowed.has(contentType)) {
          return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
        }
        const id = editId || uuidv4();
        const key = isImage
          ? generateReferenceImageKey(user.id, id, filename)
          : generateSourceKey(user.id, id, filename);
        const { uploadId } = await createMultipartUpload(key, contentType);
        return NextResponse.json({ uploadId, key, editId: id });
      }

      case 'sign': {
        const { key, uploadId, partNumber } = body;
        if (!key || !uploadId || typeof partNumber !== 'number') {
          return NextResponse.json({ error: 'Missing key, uploadId, or partNumber' }, { status: 400 });
        }
        if (partNumber < 1 || partNumber > 10_000) {
          return NextResponse.json({ error: 'partNumber out of range' }, { status: 400 });
        }
        // Authorize: the key must live under the caller's user prefix. Otherwise
        // a logged-in user could sign chunks for someone else's in-flight upload.
        if (!key.includes(`/${user.id}/`)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const url = await getPresignedUploadPartUrl(key, uploadId, partNumber);
        return NextResponse.json({ url });
      }

      case 'complete': {
        const { key, uploadId, parts } = body;
        if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
          return NextResponse.json({ error: 'Missing key, uploadId, or parts' }, { status: 400 });
        }
        if (!key.includes(`/${user.id}/`)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await completeMultipartUpload(key, uploadId, parts);
        return NextResponse.json({ ok: true });
      }

      case 'abort': {
        const { key, uploadId } = body;
        if (!key || !uploadId) {
          return NextResponse.json({ error: 'Missing key or uploadId' }, { status: 400 });
        }
        if (!key.includes(`/${user.id}/`)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        await abortMultipartUpload(key, uploadId);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[upload/multipart]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
