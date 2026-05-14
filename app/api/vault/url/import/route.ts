// =============================================================================
// Arrowhead 7 — Generic URL Importer into vault
// =============================================================================
// Pull any publicly-reachable HTTPS direct download URL into the user's vault.
// Used by:
//   • iCloud Drive direct cvws.icloud-content.com URLs
//   • Any other "Anyone with the link" cloud share that resolves to media
//   • Internal tooling that already has a signed URL handy

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { pullUrlToR2, sanitizeFilename, mimeFromName } from '@/lib/cloud/pull';
import {
  reserveVaultKey,
  registerVaultFile,
  kindForContentType,
  defaultFolderForKind,
  type VaultFolder,
} from '@/lib/vault';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function fileFromUrl(input: string): string {
  try {
    const url = new URL(input);
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last || 'video.mp4';
  } catch {
    return 'video.mp4';
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      url?: string;
      name?: string;
      folder?: VaultFolder;
    };
    const sourceUrl = body.url;

    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json(
        { error: 'Provide an https:// URL' },
        { status: 400 }
      );
    }

    const filename = sanitizeFilename(body.name || fileFromUrl(sourceUrl));
    const fallbackContentType = mimeFromName(filename);
    const kind = kindForContentType(fallbackContentType);
    const folder: VaultFolder = body.folder ?? defaultFolderForKind(kind);
    const r2Key = reserveVaultKey(user.id, folder, filename);

    const out = await pullUrlToR2({
      url: sourceUrl,
      key: r2Key,
      fallbackContentType,
    });

    const file = await registerVaultFile({
      userId: user.id,
      r2Key,
      filename,
      contentType: out.contentType,
      sizeBytes: out.bytes,
      folder,
      source: 'url',
      externalUrl: sourceUrl,
    });

    return NextResponse.json({ key: r2Key, file });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('URL import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
