// =============================================================================
// Arrowhead 7 — Caption Transcription Route
// =============================================================================
// POST /api/captions/transcribe
// Body: { mediaUrl: string, language?: string }
// Returns: WhisperTranscription with timestamped segments and words.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { rateLimitResponse } from '@/lib/rate-limit';
import {
  isWhisperConfigured,
  transcribeFromUrl,
  WhisperUnavailableError,
} from '@/lib/captions/whisper';
import { buildLinesFromTranscription, toSRT, toVTT } from '@/lib/captions/srt';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = rateLimitResponse('captions-transcribe', userId);
  if (limited) return limited;

  if (!isWhisperConfigured()) {
    return NextResponse.json(
      {
        error: 'Auto-captions are not configured on this server.',
        configured: false,
      },
      { status: 503 }
    );
  }

  let body: { mediaUrl?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mediaUrl = body.mediaUrl?.trim();
  if (!mediaUrl) {
    return NextResponse.json({ error: 'mediaUrl is required' }, { status: 400 });
  }

  try {
    const transcription = await transcribeFromUrl(mediaUrl, {
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
