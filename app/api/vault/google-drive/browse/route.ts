// =============================================================================
// Arrowhead 7 — Google Drive: Browse
// =============================================================================
// Lists files/folders from the user's Drive. Defaults to video filter.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDriveAccessToken,
  listDriveFiles,
} from '@/lib/cloud/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const folderId = request.nextUrl.searchParams.get('folderId') ?? undefined;
    const pageToken =
      request.nextUrl.searchParams.get('pageToken') ?? undefined;
    const videosOnlyParam = request.nextUrl.searchParams.get('videosOnly');
    const videosOnly = videosOnlyParam === null ? true : videosOnlyParam !== 'false';

    const { accessToken } = await getValidDriveAccessToken(user.id);
    const result = await listDriveFiles({
      accessToken,
      folderId,
      pageToken,
      videosOnly,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'Google Drive not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    console.error('Drive browse error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
