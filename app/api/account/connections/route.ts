// =============================================================================
// Arrowhead 7 — Account: Cloud Connection Status
// =============================================================================
// Lightweight read-only endpoint the editor uses to figure out which cloud
// providers the user has connected, so it can default the Import-from-Cloud
// picker to the right tab.

import { NextResponse } from 'next/server';
import { getUser, createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ google_drive: false, dropbox: false });
  }
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ google_drive: false, dropbox: false });
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('cloud_connections')
    .select('provider, connection_status')
    .eq('user_id', user.id)
    .eq('connection_status', 'connected');

  const providers = new Set<string>((data ?? []).map((r) => r.provider));
  return NextResponse.json({
    google_drive: providers.has('google_drive'),
    dropbox: providers.has('dropbox'),
    onedrive: providers.has('onedrive'),
    box: providers.has('box'),
  });
}
