// =============================================================================
// Arrowhead 7 — Google Drive: import into vault
// =============================================================================
// Streams a Drive file into the user's vault under
// `users/{uid}/vault/{folder}/...` via the multipart pull pipeline (so the
// Lambda never buffers the full file) and registers it in vault_files.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDriveAccessToken,
  downloadDriveFile,
  getDriveFile,
} from '@/lib/cloud/google-drive';
import { streamToR2 } from '@/lib/cloud/pull';
import {
  reserveVaultKey,
  registerVaultFile,
  kindForContentType,
  defaultFolderForKind,
  type VaultFolder,
} from '@/lib/vault';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      fileId?: string;
      folder?: VaultFolder;
    };
    const fileId = body.fileId;
    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const { accessToken } = await getValidDriveAccessToken(user.id);
    const meta = await getDriveFile({ accessToken, fileId });

    const fallbackContentType = meta.mimeType || 'application/octet-stream';
    const kind = kindForContentType(fallbackContentType);
    const folder: VaultFolder = body.folder ?? defaultFolderForKind(kind);
    const r2Key = reserveVaultKey(user.id, folder, meta.name);

    const { stream, contentType } = await downloadDriveFile({ accessToken, fileId });
    const out = await streamToR2({
      key: r2Key,
      contentType: contentType || fallbackContentType,
      stream,
    });

    const file = await registerVaultFile({
      userId: user.id,
      r2Key,
      filename: meta.name,
      contentType: out.contentType,
      sizeBytes: out.bytes,
      folder,
      source: 'google_drive',
      metadata: {
        drive_file_id: fileId,
        drive_web_view_link: meta.webViewLink ?? null,
      },
      thumbnailUrl: meta.thumbnailLink ?? null,
      durationMs: meta.videoMediaMetadata?.durationMillis
        ? Number(meta.videoMediaMetadata.durationMillis)
        : null,
    });

    return NextResponse.json({ key: r2Key, file });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'Google Drive not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    console.error('Drive import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
