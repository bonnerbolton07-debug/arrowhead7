// =============================================================================
// Arrowhead 7 — Vault: presigned upload URL
// =============================================================================
// Reserves an R2 key under the user's vault and returns a presigned PUT URL
// for direct browser uploads. The client must call `/api/vault/register`
// after the upload succeeds so the file lands in the vault index.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, requireUser } from '@/lib/supabase/server';
import { getPresignedUploadUrl } from '@/lib/cloudflare/r2';
import {
  reserveVaultKey,
  kindForContentType,
  defaultFolderForKind,
  type VaultFolder,
} from '@/lib/vault';
import { TIER_LIMITS, type SubscriptionTier } from '@/types';

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
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export const dynamic = 'force-dynamic';

function maxBytesFor(contentType: string): number {
  if (ALLOWED_IMAGE.has(contentType)) return MAX_IMAGE_BYTES;
  if (ALLOWED_AUDIO.has(contentType)) return MAX_AUDIO_BYTES;
  return MAX_VIDEO_BYTES;
}

function limitMessage(contentType: string): string {
  if (ALLOWED_IMAGE.has(contentType)) return 'Image must be 25MB or smaller.';
  if (ALLOWED_AUDIO.has(contentType)) return 'Audio must be 100MB or smaller.';
  return 'Video must be 500MB or smaller.';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      filename?: string;
      contentType?: string;
      folder?: VaultFolder;
      sizeBytes?: number;
    };

    const filename = (body.filename ?? '').toString();
    const contentType = (body.contentType ?? '').toString();
    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Missing filename or contentType' },
        { status: 400 }
      );
    }
    if (filename.length > 180 || /[\\/]/.test(filename)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }
    const allowed =
      ALLOWED_VIDEO.has(contentType) || ALLOWED_IMAGE.has(contentType) || ALLOWED_AUDIO.has(contentType);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }
    if (typeof body.sizeBytes !== 'number') {
      return NextResponse.json({ error: 'Missing file size' }, { status: 400 });
    }
    if (!Number.isFinite(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes > maxBytesFor(contentType)) {
      return NextResponse.json({ error: limitMessage(contentType) }, { status: 400 });
    }

    const kind = kindForContentType(contentType);
    const folder: VaultFolder = body.folder ?? defaultFolderForKind(kind);
    if (!['references', 'footage', 'exports'].includes(folder)) {
      return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, vault_storage_bytes')
      .eq('id', user.id)
      .single();
    const tier = (profile?.subscription_tier as SubscriptionTier | null) ?? 'free';
    const storageLimitGb = TIER_LIMITS[tier]?.storage_gb ?? TIER_LIMITS.free.storage_gb;
    if (storageLimitGb !== -1) {
      const quotaBytes = storageLimitGb * 1024 ** 3;
      const usedBytes = Number(profile?.vault_storage_bytes ?? 0);
      if (usedBytes + body.sizeBytes > quotaBytes) {
        return NextResponse.json(
          { error: 'Vault storage limit reached. Delete files or upgrade before uploading more media.' },
          { status: 403 }
        );
      }
    }

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
