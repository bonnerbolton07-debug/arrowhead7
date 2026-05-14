// =============================================================================
// Arrowhead 7 — Generic URL Importer
// =============================================================================
// Pull any publicly-reachable HTTPS direct download URL into R2. Used by:
//   • iCloud Drive direct cvws.icloud-content.com URLs
//   • Any other "Anyone with the link" cloud share that resolves to an MP4
//   • Internal tooling that already has a signed URL handy
//
// YouTube source ingestion: YouTube does not let third parties stream user
// videos via the public API; users must export to Drive first. This route is
// a generic fallback — paste a direct media URL and we pull it.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { pullUrlToR2, sanitizeFilename, mimeFromName } from '@/lib/cloud/pull';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function fileFromUrl(input: string): string {
  try {
    const url = new URL(input);
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last || 'video.mp4';
  } catch {
    return 'video.mp4';
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const sourceUrl: string | undefined = body.url;
    const editId: string = body.editId || uuidv4();
    const desiredName: string | undefined = body.name;

    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json(
        { error: 'Provide an https:// URL' },
        { status: 400 }
      );
    }

    const filename = sanitizeFilename(desiredName || fileFromUrl(sourceUrl));
    const key = `sources/${user.id}/${editId}/${filename}`;

    const out = await pullUrlToR2({
      url: sourceUrl,
      key,
      fallbackContentType: mimeFromName(filename),
    });

    if (!out.contentType.startsWith('video/') && !out.contentType.startsWith('image/')) {
      // Don't reject — surface the type so the caller can decide. The editor's
      // footage step accepts video MIME types only; references accept either.
    }

    return NextResponse.json({
      editId,
      key,
      name: filename,
      size: out.bytes,
      mimeType: out.contentType,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('URL import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
