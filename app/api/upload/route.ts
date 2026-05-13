// =============================================================================
// Arrowhead 7 — Upload API Route
// =============================================================================
// Generates presigned URLs for direct client-to-R2 uploads

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { getPresignedUploadUrl, generateSourceKey } from '@/lib/cloudflare/r2';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    // Reject path traversal and control characters; allow common filename chars
    .regex(/^[^\x00-\x1f\\/]+$/, 'Invalid filename'),
  contentType: z.enum(ALLOWED_TYPES),
  editId: z
    .string()
    .regex(UUID_RE, 'Invalid editId')
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }
    const { filename, contentType, editId } = parsed.data;

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
