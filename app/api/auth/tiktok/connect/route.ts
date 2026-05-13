// =============================================================================
// Arrowhead 7 — TikTok: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildTikTokAuthUrl, tiktokClientCreds } from '@/lib/distribute/tiktok';
import { generateState, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    tiktokClientCreds();
    const state = generateState();
    const nextPath =
      request.nextUrl.searchParams.get('next') || '/dashboard/channels';
    await setStateCookie('tiktok', state, nextPath);
    return NextResponse.redirect(buildTikTokAuthUrl(state));
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
