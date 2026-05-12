// =============================================================================
// Arrowhead 7 — Upload API Route
// =============================================================================
// Generates presigned URLs for direct client-to-R2 uploads

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { getPresignedUploadUrl, generateSourceKey } from '@/lib/cloudflare/r2';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const { filename, contentType, editId } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Missing filename or contentType' },
        { status: 400 }
      );
    }

    // Validate content type
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported video format. Use MP4, MOV, AVI, or WebM.' },
        { status: 400 }
      );
    }

    const id = editId || uuidv4();
    const key = generateSourceKey(user.id, id, filename);
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return NextResponse.json({
      uploadUrl,
      key,
      editId: id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Upload route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
