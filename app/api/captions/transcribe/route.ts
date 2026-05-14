// =============================================================================
// Arrowhead 7 — Caption Transcription Route
// =============================================================================
// POST /api/captions/transcribe
// Body: { r2Key: string, language?: string }
// Returns: WhisperTranscription with timestamped segments and words.
//
// Security: only R2 storage keys are accepted. The route resolves the key to a
// short-lived presigned URL server-side before handing it to Whisper, so user
// input never reaches `fetch()` as an arbitrary URL.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  isWhisperConfigured,
  transcribeFromUrl,
  WhisperUnavailableError,
} from '@/lib/captions/whisper';
import { buildLinesFromTranscription, toSRT, toVTT } from '@/lib/captions/srt';
import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const R2_KEY_PATTERN = /^(sources|processing|references|users)\/[A-Za-z0-9_\-./]+$/;

function isValidR2Key(key: string): boolean {
  if (key.includes('..')) return false;
  return R2_KEY_PATTERN.test(key);
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isWhisperConfigured()) {
    return NextResponse.json(
      {
        error: 'Auto-captions are not configured on this server.',
        configured: false,
      },
      { status: 503 }
    );
  }

  let body: { r2Key?: string; mediaUrl?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Accept `r2Key` (preferred) — legacy `mediaUrl` field is treated as an R2
  // key for back-compat with older clients but is never used as a raw URL.
  const key = (body.r2Key ?? body.mediaUrl)?.trim();
  if (!key) {
    return NextResponse.json({ error: 'r2Key is required' }, { status: 400 });
  }
  if (!isValidR2Key(key)) {
    return NextResponse.json(
      { error: 'r2Key must be a valid R2 storage key (e.g. users/<id>/...)' },
      { status: 400 }
    );
  }

  let presignedUrl: string;
  try {
    presignedUrl = await getPresignedDownloadUrl(key, 3600);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve media';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const transcription = await transcribeFromUrl(presignedUrl, {
      language: body.language,
    });
    const lines = buildLinesFromTranscription(transcription);

    return NextResponse.json({
      transcription,
      lines,
      srt: toSRT(lines),
      vtt: toVTT(lines),
    });
  } catch (err) {
    if (err instanceof WhisperUnavailableError) {
      return NextResponse.json(
        { error: err.message, configured: false },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
