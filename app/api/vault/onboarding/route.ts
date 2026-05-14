// =============================================================================
// Arrowhead 7 — Vault: onboarding state
// =============================================================================
// GET  → returns the user's onboarding step + completion timestamp
// PATCH → updates `onboarding_step`, `vault_name`, or marks onboarding done

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STEPS = new Set(['vault', 'sources', 'import', 'studio', 'done']);

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_step, onboarding_completed_at, vault_name, vault_storage_bytes, vault_file_count')
      .eq('id', user.id)
      .single();
    return NextResponse.json({
      step: data?.onboarding_step ?? 'vault',
      completedAt: data?.onboarding_completed_at ?? null,
      vaultName: data?.vault_name ?? null,
      storageBytes: Number(data?.vault_storage_bytes ?? 0),
      fileCount: Number(data?.vault_file_count ?? 0),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/onboarding GET error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      step?: string;
      vaultName?: string;
      complete?: boolean;
    };
    const update: Record<string, unknown> = {};

    if (body.step) {
      if (!STEPS.has(body.step)) {
        return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
      }
      update.onboarding_step = body.step;
    }
    if (typeof body.vaultName === 'string') {
      const trimmed = body.vaultName.trim().slice(0, 80);
      if (trimmed) update.vault_name = trimmed;
    }
    if (body.complete) {
      update.onboarding_step = 'done';
      update.onboarding_completed_at = new Date().toISOString();
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('onboarding_step, onboarding_completed_at, vault_name')
      .single();
    if (error) {
      console.error('onboarding update error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      step: data?.onboarding_step ?? 'vault',
      completedAt: data?.onboarding_completed_at ?? null,
      vaultName: data?.vault_name ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/onboarding PATCH error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
