// =============================================================================
// Arrowhead 7 — Vault: presigned upload URL
// =============================================================================
// Reserves an R2 key under the user's vault and returns a presigned PUT URL
// for direct browser uploads. The client must call `/api/vault/register`
// after the upload succeeds so the file lands in the vault index.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { getPresignedUploadUrl } from '@/lib/cloudflare/r2';
import {
  reserveVaultKey,
  kindForContentType,
  defaultFolderForKind,
  type VaultFolder,
} from '@/lib/vault';

const ALLOWED_VIDEO = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
]);
const ALLOWED_IMAGE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
]);
const ALLOWED_AUDIO = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
]);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      filename?: string;
      contentType?: string;
      folder?: VaultFolder;
    };

    const filename = (body.filename ?? '').toString();
    const contentType = (body.contentType ?? '').toString();
    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Missing filename or contentType' },
        { status: 400 }
      );
    }
    const allowed =
      ALLOWED_VIDEO.has(contentType) || ALLOWED_IMAGE.has(contentType) || ALLOWED_AUDIO.has(contentType);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    const kind = kindForContentType(contentType);
    const folder: VaultFolder = body.folder ?? defaultFolderForKind(kind);
    const key = reserveVaultKey(user.id, folder, filename);
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return NextResponse.json({ uploadUrl, key, folder, kind });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/upload error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
