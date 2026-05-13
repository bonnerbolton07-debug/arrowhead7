// =============================================================================
// Arrowhead 7 — X (Twitter): OAuth Connect (PKCE)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { buildXAuthUrl, xClientCreds } from '@/lib/distribute/x';
import {
  generateState,
  generatePkcePair,
  setStateCookie,
  setPkceCookie,
} from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    xClientCreds();
    const state = generateState();
    const { verifier, challenge } = generatePkcePair();
    const nextPath =
      request.nextUrl.searchParams.get('next') || '/dashboard/channels';
    await setStateCookie('x', state, nextPath);
    await setPkceCookie('x', verifier);
    return NextResponse.redirect(buildXAuthUrl({ state, challenge }));
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
