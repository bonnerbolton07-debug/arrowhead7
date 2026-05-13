// =============================================================================
// Arrowhead 7 — Strategy Brain API: Hooks
// =============================================================================
// GET /api/strategy/hooks — filtered hook library.
// Authenticated to any signed-in user — Starter users see this as a teaser,
// but the library itself is always shown so the upgrade path feels tangible.

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { filterHooks } from '@/lib/strategy-brain';
import type { HookCategory, StrategyPlatform } from '@/types/strategy';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS: StrategyPlatform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
];

const VALID_CATEGORIES: HookCategory[] = [
  'curiosity',
  'value',
  'controversy',
  'storytelling',
  'pattern-interrupt',
  'authority',
  'visual-shock',
  'numbered-list',
];

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const platformParam = url.searchParams.get('platform');
    const categoryParam = url.searchParams.get('category');
    const niche = url.searchParams.get('niche') ?? undefined;

    let platform: StrategyPlatform | undefined;
    if (platformParam) {
      const candidate = platformParam.toLowerCase() as StrategyPlatform;
      if (!VALID_PLATFORMS.includes(candidate)) {
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
      }
      platform = candidate;
    }

    let category: HookCategory | undefined;
    if (categoryParam) {
      const candidate = categoryParam.toLowerCase() as HookCategory;
      if (!VALID_CATEGORIES.includes(candidate)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      category = candidate;
    }

    const hooks = filterHooks({ category, platform, niche });
    return NextResponse.json({ hooks });
  } catch (err) {
    console.error('Strategy hooks failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
