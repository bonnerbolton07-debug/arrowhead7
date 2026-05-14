// =============================================================================
// Arrowhead 7 — iCloud share-link resolver
// =============================================================================
// POST { shareUrl } → returns the parsed file metadata so the client can
// confirm filename/size before pulling. Read-only, no R2 write.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { resolveIcloudShare, isIcloudShareUrl } from '@/lib/cloud/icloud';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    const shareUrl: string | undefined = body.shareUrl;
    if (!shareUrl || !isIcloudShareUrl(shareUrl)) {
      return NextResponse.json(
        { error: 'Provide a public iCloud Drive share link (https://www.icloud.com/iclouddrive/…)' },
        { status: 400 }
      );
    }
    const resolved = await resolveIcloudShare(shareUrl);
    return NextResponse.json({
      name: resolved.name,
      size: resolved.size,
      contentType: resolved.contentType,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
