// =============================================================================
// Arrowhead 7 — Google Drive: Import
// =============================================================================
// Streams a Drive video into R2 under sources/<userId>/<editId>/<name>. The
// body is piped through the S3 multipart uploader (lib/cloud/pull.ts) so the
// Lambda never holds more than ~8 MiB at a time.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDriveAccessToken,
  downloadDriveFile,
  getDriveFile,
} from '@/lib/cloud/google-drive';
import { streamToR2, sanitizeFilename } from '@/lib/cloud/pull';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const fileId: string | undefined = body.fileId;
    const editId: string = body.editId || uuidv4();

    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const { accessToken } = await getValidDriveAccessToken(user.id);

    const meta = await getDriveFile({ accessToken, fileId });
    if (!meta.mimeType.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Selected file is not a video' },
        { status: 400 }
      );
    }

    const name = sanitizeFilename(meta.name);
    const key = `sources/${user.id}/${editId}/${name}`;
    const { stream, contentType } = await downloadDriveFile({
      accessToken,
      fileId,
    });

    const out = await streamToR2({
      key,
      contentType: contentType || meta.mimeType,
      stream,
    });

    return NextResponse.json({
      editId,
      key,
      name: meta.name,
      size: out.bytes,
      mimeType: out.contentType,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'Google Drive not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    console.error('Drive import error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
