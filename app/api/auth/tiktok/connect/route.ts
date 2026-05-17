// =============================================================================
// Arrowhead 7 — TikTok: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildTikTokAuthUrl, tiktokClientCreds } from '@/lib/distribute/tiktok';
import { createOAuthState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    tiktokClientCreds();
    const nextPath =
      request.nextUrl.searchParams.get('next') || '/dashboard/channels';
    const redirectUri = getRedirectUri('tiktok', request);
    const state = createOAuthState('tiktok', user.id, nextPath, redirectUri);
    await setStateCookie('tiktok', state, nextPath, redirectUri, user.id);
    return NextResponse.redirect(buildTikTokAuthUrl(state, redirectUri));
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
