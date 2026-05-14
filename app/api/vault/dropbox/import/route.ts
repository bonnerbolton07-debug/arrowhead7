// =============================================================================
// Arrowhead 7 — Dropbox: Import
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDropboxAccessToken,
  downloadDropboxFile,
} from '@/lib/cloud/dropbox';
import { streamToR2, sanitizeFilename, mimeFromName } from '@/lib/cloud/pull';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const path: string | undefined = body.path;
    const name: string | undefined = body.name;
    const editId: string = body.editId || uuidv4();

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    const { accessToken } = await getValidDropboxAccessToken(user.id);
    const filename = sanitizeFilename(name || path.split('/').pop() || 'video.mp4');
    const contentType = mimeFromName(filename);

    const { stream } = await downloadDropboxFile({ accessToken, path });
    const key = `sources/${user.id}/${editId}/${filename}`;

    const out = await streamToR2({ key, contentType, stream });

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
    if (msg === 'Dropbox not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    console.error('Dropbox import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
