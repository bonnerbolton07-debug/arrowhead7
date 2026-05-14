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
import { generateState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    googleClientCreds(); // throws if env missing

    const state = generateState();
    const nextPath = request.nextUrl.searchParams.get('next') || '/vault';
    const redirectUri = getRedirectUri('google-drive', request);
    // Log the exact URI so the user can copy it into Google Cloud Console
    // if the request fails. Visible in Vercel function logs.
    console.log('[oauth/google-drive/connect] redirect_uri:', redirectUri);
    await setStateCookie('google-drive', state, nextPath, redirectUri);

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
    return NextResponse.redirect(
      new URL(`/dashboard/channels?error=${encodeURIComponent(msg)}`, request.url)
    );
  }
}
