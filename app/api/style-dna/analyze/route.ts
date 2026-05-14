// =============================================================================
// Arrowhead 7 — Style DNA analysis API
// =============================================================================
// POST { references: Array<{ url, platform?, weight? }>, options? }
// -> { styleDNA: Omit<StyleDNA, 'id'|'created_at'|'updated_at'> }
//
// Runs in the Node.js runtime because the analyser shells out to FFmpeg.
// Includes a 60s analysis timeout — if the FFmpeg pipeline doesn't complete
// in time, returns a graceful error so the frontend doesn't hang.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { analyzeReferenceVideos } from '@/lib/style-dna/analyzer';
import { rateLimitResponse } from '@/lib/rate-limit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hard ceiling so the Lambda never idles for 5 minutes on a stuck pipeline. */
const ANALYSIS_TIMEOUT_MS = 60_000;

const Body = z.object({
  references: z.array(
    z.object({
      url: z.string().min(1),
      type: z.enum(['video', 'image']).optional(),
      platform: z.enum(['instagram', 'tiktok', 'youtube', 'x', 'other']).optional(),
      weight: z.number().min(0).max(1).optional(),
    })
  ).min(1).max(10),
  options: z.object({
    maxAnalyzeSeconds: z.number().min(5).max(300).optional(),
    sceneThreshold: z.number().min(0.05).max(0.95).optional(),
  }).optional(),
});

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer!));
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const limited = rateLimitResponse('style-dna-analyze', user.id);
    if (limited) return limited;

    const json = await request.json();
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { references, options } = parsed.data;

    const dna = await withTimeout(
      analyzeReferenceVideos(references, user.id, options),
      ANALYSIS_TIMEOUT_MS,
      'Style DNA analysis'
    );
    return NextResponse.json({ styleDNA: dna });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[style-dna/analyze]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Style DNA analysis failed' },
      { status: 500 }
    );
  }
}
