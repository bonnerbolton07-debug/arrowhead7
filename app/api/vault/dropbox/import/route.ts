// =============================================================================
// Arrowhead 7 — Dropbox: Import
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  getValidDropboxAccessToken,
  downloadDropboxFile,
} from '@/lib/cloud/dropbox';
import { uploadToR2 } from '@/lib/cloudflare/r2';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'video.mp4';
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
  };
  return (ext && map[ext]) || 'application/octet-stream';
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
    const path: string | undefined = body.path;
    const name: string | undefined = body.name;
    const editId: string = body.editId || uuidv4();

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    const { accessToken } = await getValidDropboxAccessToken(user.id);
    const filename = sanitizeName(name || path.split('/').pop() || 'video.mp4');
    const contentType = mimeFromName(filename);

    const { stream } = await downloadDropboxFile({ accessToken, path });
    const buf = await streamToBuffer(stream);

    const key = `sources/${user.id}/${editId}/${filename}`;
    await uploadToR2(key, buf, contentType);

    return NextResponse.json({
      editId,
      key,
      name: filename,
      size: buf.length,
      mimeType: contentType,
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
