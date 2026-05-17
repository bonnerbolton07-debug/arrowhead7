// =============================================================================
// Arrowhead 7 — Google Drive: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  buildGoogleAuthUrl,
  GOOGLE_DRIVE_SCOPES,
  googleClientCreds,
} from '@/lib/cloud/google-drive';
import { createOAuthState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    googleClientCreds(); // throws if env missing

    const nextPath = request.nextUrl.searchParams.get('next') || '/vault';
    const redirectUri = getRedirectUri('google-drive', request);
    const state = createOAuthState('google-drive', user.id, nextPath, redirectUri);
    await setStateCookie('google-drive', state, nextPath, redirectUri, user.id);

    const url = buildGoogleAuthUrl({
      provider: 'google-drive',
      scopes: GOOGLE_DRIVE_SCOPES,
      state,
      redirectUri,
    });
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    const code = msg.includes('GOOGLE_CLIENT_ID') ? 'provider_setup_google_drive' : msg;
    return NextResponse.redirect(
      new URL(`/dashboard/channels?error=${encodeURIComponent(code)}`, request.url)
    );
  }
}
