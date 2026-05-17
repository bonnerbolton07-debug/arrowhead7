// =============================================================================
// Arrowhead 7 — YouTube: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildYouTubeAuthUrl } from '@/lib/distribute/youtube';
import { googleClientCreds } from '@/lib/cloud/google-drive';
import { createOAuthState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    googleClientCreds();
    const nextPath =
      request.nextUrl.searchParams.get('next') || '/dashboard/channels';
    const redirectUri = getRedirectUri('youtube', request);
    const state = createOAuthState('youtube', user.id, nextPath, redirectUri);
    await setStateCookie('youtube', state, nextPath, redirectUri, user.id);
    return NextResponse.redirect(buildYouTubeAuthUrl(state, redirectUri));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    const code = msg.includes('TOKEN_ENCRYPTION_KEY')
      ? 'provider_setup_secure_storage'
      : msg;
    return NextResponse.redirect(
      new URL(`/dashboard/channels?error=${encodeURIComponent(code)}`, request.url)
    );
  }
}
