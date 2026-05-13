// =============================================================================
// Arrowhead 7 — Strategy Brain API: Recommendations
// =============================================================================
// GET /api/strategy/recommendations — personalized "Next Best Content" bundle.
//
// Auth + Pro/Enterprise gating via requireStrategyAccess. Starter users get a
// 402 with a structured payload the UI can render as a teaser.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  requireStrategyAccess,
  buildRecommendations,
} from '@/lib/strategy-brain';
import { StrategyAccessError } from '@/lib/strategy-brain/gating';
import type {
  ContentPerformanceRow,
  StrategyPlatform,
} from '@/types/strategy';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS: StrategyPlatform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
];

export async function GET(request: NextRequest) {
  try {
    const access = await requireStrategyAccess();
    const supabase = await createServerSupabaseClient();
    const url = new URL(request.url);

    const platformsParam = url.searchParams.get('platforms');
    const platforms = platformsParam
      ? platformsParam
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter((p): p is StrategyPlatform =>
            VALID_PLATFORMS.includes(p as StrategyPlatform)
          )
      : undefined;
    const niche = url.searchParams.get('niche') ?? undefined;
    const limit = Math.min(
      24,
      Math.max(1, Number(url.searchParams.get('limit') ?? 6))
    );

    const { data: rows } = await supabase
      .from('content_performance')
      .select('*')
      .eq('user_id', access.user_id)
      .order('posted_at', { ascending: false })
      .limit(200);

    const history = (rows ?? []) as ContentPerformanceRow[];

    const bundle = await buildRecommendations({
      userId: access.user_id,
      history,
      platforms,
      niche,
      limit,
    });

    return NextResponse.json(bundle);
  } catch (err) {
    if (err instanceof StrategyAccessError) {
      return NextResponse.json(
        { error: err.message, code: err.code, locked: err.code === 'locked' },
        { status: err.status }
      );
    }
    console.error('Strategy recommendations failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
