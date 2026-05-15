// =============================================================================
// Arrowhead 7 — Vault: single-file operations
// =============================================================================
// GET    /api/vault/files/{id} — returns a short-lived download URL
// DELETE /api/vault/files/{id} — deletes the file from R2 + index

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import { vaultDownloadUrl, deleteVaultFile } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('vault_files')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const downloadUrl = await vaultDownloadUrl(data.r2_key);
    return NextResponse.json({ file: data, downloadUrl });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/files/{id} GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await deleteVaultFile(user.id, id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/files/{id} DELETE error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
