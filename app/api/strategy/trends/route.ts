// =============================================================================
// Arrowhead 7 — Strategy Brain API: Trends
// =============================================================================
// GET /api/strategy/trends — current trending audio / hashtags / formats.
// Authenticated to any signed-in user (trend cache is shared), but the
// teaser/upgrade contract still applies for unlocked features in the UI.

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getTrends } from '@/lib/strategy-brain';
import type { StrategyPlatform, TrendType } from '@/types/strategy';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS: StrategyPlatform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
];

const VALID_TYPES: TrendType[] = ['audio', 'hashtag', 'format', 'topic', 'effect'];

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const platformParam = url.searchParams.get('platform');
    const typeParam = url.searchParams.get('type');
    const niche = url.searchParams.get('niche') ?? undefined;
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('limit') ?? 30))
    );

    let platform: StrategyPlatform | undefined;
    if (platformParam) {
      const candidate = platformParam.toLowerCase() as StrategyPlatform;
      if (!VALID_PLATFORMS.includes(candidate)) {
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
      }
      platform = candidate;
    }

    let trendType: TrendType | undefined;
    if (typeParam) {
      const candidate = typeParam.toLowerCase() as TrendType;
      if (!VALID_TYPES.includes(candidate)) {
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
      }
      trendType = candidate;
    }

    const trends = await getTrends({ platform, trendType, niche, limit });
    return NextResponse.json({ trends, fetched_at: new Date().toISOString() });
  } catch (err) {
    console.error('Strategy trends failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
