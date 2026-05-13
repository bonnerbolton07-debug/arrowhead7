// =============================================================================
// Arrowhead 7 — Google Drive: Import
// =============================================================================
// Streams a Drive video into R2 under sources/<userId>/<editId>/<name>.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDriveAccessToken,
  downloadDriveFile,
  getDriveFile,
} from '@/lib/cloud/google-drive';
import { uploadToR2 } from '@/lib/cloudflare/r2';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'video.mp4';
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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

    const name = sanitizeName(meta.name);
    const key = `sources/${user.id}/${editId}/${name}`;
    const { stream, contentType } = await downloadDriveFile({ accessToken, fileId });
    const buf = await streamToBuffer(stream);
    await uploadToR2(key, buf, contentType || meta.mimeType);

    return NextResponse.json({
      editId,
      key,
      name: meta.name,
      size: buf.length,
      mimeType: meta.mimeType,
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
