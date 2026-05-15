// =============================================================================
// Arrowhead 7 — Dropbox: OAuth Connect
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildDropboxAuthUrl, dropboxClientCreds } from '@/lib/cloud/dropbox';
import { generateState, getRedirectUri, setStateCookie } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    dropboxClientCreds();
    const state = generateState();
    const nextPath = request.nextUrl.searchParams.get('next') || '/vault';
    const redirectUri = getRedirectUri('dropbox', request);
    await setStateCookie('dropbox', state, nextPath, redirectUri);
    return NextResponse.redirect(buildDropboxAuthUrl(state, redirectUri));
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
