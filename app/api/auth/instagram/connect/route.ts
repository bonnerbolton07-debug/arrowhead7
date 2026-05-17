// =============================================================================
// Arrowhead 7 — Instagram: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildInstagramAuthUrl, fbClientCreds } from '@/lib/distribute/instagram';
import { createOAuthState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    fbClientCreds();
    const nextPath =
      request.nextUrl.searchParams.get('next') || '/dashboard/channels';
    const redirectUri = getRedirectUri('instagram', request);
    const state = createOAuthState('instagram', user.id, nextPath, redirectUri);
    await setStateCookie('instagram', state, nextPath, redirectUri, user.id);
    return NextResponse.redirect(buildInstagramAuthUrl(state, redirectUri));
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
