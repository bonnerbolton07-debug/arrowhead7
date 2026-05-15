// =============================================================================
// Arrowhead 7 — YouTube: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildYouTubeAuthUrl } from '@/lib/distribute/youtube';
import { googleClientCreds } from '@/lib/cloud/google-drive';
import { generateState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    googleClientCreds();
    const state = generateState();
    const nextPath =
      request.nextUrl.searchParams.get('next') || '/dashboard/channels';
    const redirectUri = getRedirectUri('youtube', request);
    await setStateCookie('youtube', state, nextPath, redirectUri);
    return NextResponse.redirect(buildYouTubeAuthUrl(state, redirectUri));
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
