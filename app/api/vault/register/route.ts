// =============================================================================
// Arrowhead 7 — Vault: register a finished upload
// =============================================================================
// After a presigned PUT completes, the client tells us the key + size and we
// insert a `vault_files` row. The DB trigger keeps storage stats current.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  headR2,
  parseVaultKey,
  parseEditorMediaKey,
  type VaultFolder,
} from '@/lib/cloudflare/r2';
import {
  registerVaultFile,
  mimeFromFilename,
  kindForContentType,
  defaultFolderForKind,
  type VaultSource,
} from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      r2Key?: string;
      filename?: string;
      contentType?: string;
      sizeBytes?: number;
      folder?: VaultFolder;
      source?: VaultSource;
      editId?: string | null;
      externalUrl?: string | null;
    };

    const r2Key = (body.r2Key ?? '').toString();
    if (!r2Key) {
      return NextResponse.json({ error: 'Missing r2Key' }, { status: 400 });
    }

    // Accept both vault keys (`users/{uid}/vault/{folder}/...`) and editor
    // source/reference media keys (`sources|references/{uid}/{editId}/...`).
    const vaultParsed = parseVaultKey(r2Key);
    const editorParsed = vaultParsed ? null : parseEditorMediaKey(r2Key);
    const ownerId = vaultParsed?.userId ?? editorParsed?.userId ?? null;
    if (!ownerId) {
      return NextResponse.json({ error: 'Invalid storage key' }, { status: 400 });
    }
    if (ownerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the object actually exists in R2 and capture its size if the
    // client didn't pass one (or under-reports — never trust the client).
    const head = await headR2(r2Key);
    if (!head) {
      return NextResponse.json(
        { error: 'Upload not found in storage' },
        { status: 404 }
      );
    }
    const size = head.size || Number(body.sizeBytes ?? 0);

    const fallbackFilename = vaultParsed?.filename ?? editorParsed?.filename ?? 'file';
    const filename = (body.filename ?? fallbackFilename).toString();
    const contentType =
      (body.contentType ?? head.contentType ?? mimeFromFilename(filename)).toString();

    // Vault keys carry their folder; editor keys don't, so derive it from the
    // media kind (video → footage, image/audio → references).
    const folder: VaultFolder =
      body.folder ?? vaultParsed?.folder ?? defaultFolderForKind(kindForContentType(contentType));

    const file = await registerVaultFile({
      userId: user.id,
      r2Key,
      filename,
      contentType,
      sizeBytes: size,
      folder,
      source: body.source ?? 'upload',
      editId: body.editId ?? null,
      externalUrl: body.externalUrl ?? null,
    });

    if (!file) {
      return NextResponse.json({ error: 'Register failed' }, { status: 500 });
    }
    return NextResponse.json({ file });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/register error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
