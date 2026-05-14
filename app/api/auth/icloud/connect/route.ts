// =============================================================================
// Arrowhead 7 — iCloud "Connect" (share-link mode)
// =============================================================================
// iCloud Drive has no public OAuth. This route exists so the "Connect" button
// on the channels/vault pages doesn't 404 — it simply bounces the user back to
// the vault with the share-link import dialog pre-opened. No tokens stored,
// no provider redirect.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const nextPath = request.nextUrl.searchParams.get('next') || '/vault';
  return NextResponse.redirect(
    new URL(`${nextPath}?icloud=share`, request.url)
  );
}
