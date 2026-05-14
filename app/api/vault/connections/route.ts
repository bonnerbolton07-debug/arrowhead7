// =============================================================================
// Arrowhead 7 — Vault: connected cloud sources
// =============================================================================
// Returns the user's `cloud_connections` rows in a minimal shape suitable
// for the onboarding + vault UI (provider name + display account).

import { NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('cloud_connections')
      .select('provider, account_email, account_name, connection_status, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    const connections = (data ?? []).map((c) => ({
      provider: c.provider,
      account: c.account_email ?? c.account_name ?? 'Connected',
      status: c.connection_status,
    }));
    return NextResponse.json({ connections });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('vault/connections error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
