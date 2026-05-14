// =============================================================================
// Arrowhead 7 — Vault: list files
// =============================================================================
// GET /api/vault/files?folder=references|footage|exports
// Returns vault rows for the calling user, optionally filtered by folder.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { listVaultFiles, getVaultStats, type VaultFolder } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const folderParam = request.nextUrl.searchParams.get('folder');
    const folder: VaultFolder | undefined =
      folderParam === 'references' ||
      folderParam === 'footage' ||
      folderParam === 'exports'
        ? folderParam
        : undefined;

    const [files, stats] = await Promise.all([
      listVaultFiles(user.id, folder),
      getVaultStats(user.id),
    ]);
    return NextResponse.json({ files, stats });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/files error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
