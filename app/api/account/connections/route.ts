// =============================================================================
// Arrowhead 7 — Account: Cloud Connection Status
// =============================================================================
// Lightweight read-only endpoint the editor uses to figure out which cloud
// providers the user has connected, so it can default the Import-from-Cloud
// picker to the right tab.

import { NextResponse } from 'next/server';
import { getUser, createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getAdminClient, isAdminConfigured } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function providerSetup() {
  return {
    google_drive_configured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    dropbox_configured: Boolean(
      process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET
    ),
    icloud_share_link: true,
  };
}

export async function GET() {
  const setup = providerSetup();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ google_drive: false, dropbox: false, ...setup });
  }
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ google_drive: false, dropbox: false, ...setup });
  }
  const supabase = isAdminConfigured()
    ? getAdminClient()
    : await createServerSupabaseClient();
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
    ...setup,
  });
}
