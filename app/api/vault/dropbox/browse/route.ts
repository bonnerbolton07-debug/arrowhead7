// =============================================================================
// Arrowhead 7 — Dropbox: Browse
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDropboxAccessToken,
  listDropboxFolder,
} from '@/lib/cloud/dropbox';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const path = request.nextUrl.searchParams.get('path') ?? '';
    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
    const videosOnlyParam = request.nextUrl.searchParams.get('videosOnly');
    const videosOnly = videosOnlyParam === null ? true : videosOnlyParam !== 'false';

    const { accessToken } = await getValidDropboxAccessToken(user.id);
    const result = await listDropboxFolder({
      accessToken,
      path,
      cursor,
      videosOnly,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'Dropbox not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    console.error('Dropbox browse error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
