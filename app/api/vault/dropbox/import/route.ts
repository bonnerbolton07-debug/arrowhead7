// =============================================================================
// Arrowhead 7 — Dropbox: import into vault
// =============================================================================
// Streams the Dropbox file body through the multipart pull pipeline into the
// user's vault, then registers the resulting row.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDropboxAccessToken,
  downloadDropboxFile,
} from '@/lib/cloud/dropbox';
import { streamToR2, sanitizeFilename, mimeFromName } from '@/lib/cloud/pull';
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
      path?: string;
      name?: string;
      folder?: VaultFolder;
    };
    const path = body.path;
    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    const { accessToken } = await getValidDropboxAccessToken(user.id);
    const filename = sanitizeFilename(body.name || path.split('/').pop() || 'video.mp4');
    const contentType = mimeFromName(filename);
    const kind = kindForContentType(contentType);
    const folder: VaultFolder = body.folder ?? defaultFolderForKind(kind);
    const r2Key = reserveVaultKey(user.id, folder, filename);

    const { stream } = await downloadDropboxFile({ accessToken, path });
    const out = await streamToR2({ key: r2Key, contentType, stream });

    const file = await registerVaultFile({
      userId: user.id,
      r2Key,
      filename,
      contentType: out.contentType,
      sizeBytes: out.bytes,
      folder,
      source: 'dropbox',
      metadata: { dropbox_path: path },
    });

    return NextResponse.json({ key: r2Key, file });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'Dropbox not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    console.error('Dropbox import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
