// =============================================================================
// Arrowhead 7 — Dropbox: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildDropboxAuthUrl, dropboxClientCreds } from '@/lib/cloud/dropbox';
import { createOAuthState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    dropboxClientCreds();
    const nextPath = request.nextUrl.searchParams.get('next') || '/vault';
    const redirectUri = getRedirectUri('dropbox', request);
    const state = createOAuthState('dropbox', user.id, nextPath, redirectUri);
    await setStateCookie('dropbox', state, nextPath, redirectUri, user.id);
    return NextResponse.redirect(buildDropboxAuthUrl(state, redirectUri));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    const code = msg.includes('DROPBOX_APP_KEY') ? 'provider_setup_dropbox' : msg;
    return NextResponse.redirect(
      new URL(`/dashboard/channels?error=${encodeURIComponent(code)}`, request.url)
    );
  }
}
