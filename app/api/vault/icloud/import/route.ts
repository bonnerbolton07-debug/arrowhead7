// =============================================================================
// Arrowhead 7 — iCloud Drive: Import from share link into vault
// =============================================================================
// Accepts a public iCloud Drive share URL, resolves it through Apple's
// public-records API, streams the file into the user's vault via the
// multipart pull pipeline, and registers a `vault_files` row.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { downloadIcloudShare, isIcloudShareUrl } from '@/lib/cloud/icloud';
import { streamToR2, sanitizeFilename, mimeFromName } from '@/lib/cloud/pull';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { encryptToken } from '@/lib/crypto/tokens';
import {
  reserveVaultKey,
  registerVaultFile,
  kindForContentType,
  defaultFolderForKind,
  type VaultFolder,
} from '@/lib/vault';
import { vaultImportResponse } from '@/lib/vault/import-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      shareUrl?: string;
      folder?: VaultFolder;
    };
    const shareUrl = body.shareUrl;

    if (!shareUrl || !isIcloudShareUrl(shareUrl)) {
      return NextResponse.json(
        { error: 'Provide a public iCloud Drive share link (https://www.icloud.com/iclouddrive/…)' },
        { status: 400 }
      );
    }

    const { stream, contentType, name } = await downloadIcloudShare(shareUrl);
    const filename = sanitizeFilename(name);
    const resolvedContentType = contentType || mimeFromName(filename) || 'application/octet-stream';
    const kind = kindForContentType(resolvedContentType);
    const folder: VaultFolder = body.folder ?? defaultFolderForKind(kind);
    const r2Key = reserveVaultKey(user.id, folder, filename);

    const out = await streamToR2({
      key: r2Key,
      contentType: resolvedContentType,
      stream,
    });

    const file = await registerVaultFile({
      userId: user.id,
      r2Key,
      filename,
      contentType: out.contentType,
      sizeBytes: out.bytes,
      folder,
      source: 'icloud',
      externalUrl: shareUrl,
    });

    // Record a virtual "connection" so the iCloud tile flips to connected.
    try {
      const supabase = await createServerSupabaseClient();
      await supabase.from('cloud_connections').upsert(
        {
          user_id: user.id,
          provider: 'icloud',
          account_id: 'share-link',
          account_email: null,
          account_name: 'Share-link mode',
          access_token_encrypted: encryptToken('share-link'),
          connection_status: 'connected',
          metadata: { mode: 'share-link', last_url: shareUrl },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider,account_id' }
      );
    } catch {
      // Non-fatal — connection row is cosmetic.
    }

    return NextResponse.json(
      vaultImportResponse({
        key: r2Key,
        file,
        fallbackName: filename,
        fallbackSize: out.bytes,
        fallbackContentType: out.contentType,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('iCloud import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
