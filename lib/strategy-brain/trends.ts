// =============================================================================
// Arrowhead 7 — Strategy Brain: Trend Detection
// =============================================================================
// Step 1: curated trend feeds + the trend_cache table. Reading is fast and
// deterministic. Writes happen via a separate ingest path (cron / admin job).
//
// When we wire real APIs (TikTok Creative Center, YouTube trending, etc.) we
// only need to swap the body of `fetchLiveTrends` — the cache contract stays
// the same.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  StrategyPlatform,
  Trend,
  TrendType,
  TrendAudio,
  TrendHashtag,
  TrendFormat,
} from '@/types/strategy';

const TREND_CACHE_TTL_HOURS = 6;

// ─── Curated baseline ─────────────────────────────────────────────────────
// These are the fallback trends if the cache table is empty. They reflect the
// kinds of patterns we expect to see — once real ingestion is live, cache rows
// will outrank these.

const NOW = () => new Date().toISOString();
const EXPIRES = () =>
  new Date(Date.now() + TREND_CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

function baselineAudio(platform: StrategyPlatform): Trend[] {
  if (platform !== 'tiktok' && platform !== 'instagram') return [];
  const tracks: TrendAudio[] = [
    {
      title: 'Sunset Lover (slowed)',
      artist: 'Petit Biscuit',
      uses_count: 412_000,
      growth_pct: 18,
    },
    {
      title: 'Tum Hi Ho (sped up)',
      artist: 'Arijit Singh',
      uses_count: 287_000,
      growth_pct: 24,
    },
    {
      title: 'Original Sound — corporate-mic-typing',
      uses_count: 95_000,
      growth_pct: 60,
    },
  ];
  return tracks.map((t, i) => ({
    id: `baseline-audio-${platform}-${i}`,
    platform,
    trend_type: 'audio' as TrendType,
    score: 90 - i * 8,
    fetched_at: NOW(),
    expires_at: EXPIRES(),
    trend_data: t,
  }));
}

function baselineHashtags(platform: StrategyPlatform): Trend[] {
  const tagsByPlatform: Partial<Record<StrategyPlatform, TrendHashtag[]>> = {
    tiktok: [
      { tag: '#CreatorTok', post_count: 12_400_000, growth_pct: 9 },
      { tag: '#EditingTutorial', post_count: 2_800_000, growth_pct: 22 },
      { tag: '#BehindTheScenes', post_count: 8_100_000, growth_pct: 7 },
    ],
    instagram: [
      { tag: '#ReelsViral', post_count: 41_000_000, growth_pct: 6 },
      { tag: '#ContentCreator', post_count: 22_000_000, growth_pct: 4 },
      { tag: '#CreatorLife', post_count: 9_500_000, growth_pct: 11 },
    ],
    youtube: [
      { tag: '#Shorts', post_count: 0, growth_pct: 0 },
      { tag: '#HowTo', post_count: 0, growth_pct: 0 },
    ],
    twitter: [
      { tag: '#BuildInPublic', growth_pct: 14 },
      { tag: '#CreatorEconomy', growth_pct: 8 },
    ],
    linkedin: [
      { tag: '#CreatorEconomy', growth_pct: 6 },
      { tag: '#AI', growth_pct: 19 },
    ],
    facebook: [
      { tag: '#Reels', growth_pct: 5 },
    ],
  };
  const tags = tagsByPlatform[platform] ?? [];
  return tags.map((tag, i) => ({
    id: `baseline-hashtag-${platform}-${i}`,
    platform,
    trend_type: 'hashtag' as TrendType,
    score: 80 - i * 6,
    fetched_at: NOW(),
    expires_at: EXPIRES(),
    trend_data: tag,
  }));
}

function baselineFormats(platform: StrategyPlatform): Trend[] {
  const formatsByPlatform: Partial<Record<StrategyPlatform, TrendFormat[]>> = {
    tiktok: [
      {
        name: 'Voiceover demo over screen recording',
        description: 'Pair a 30-45s screen recording with a personal voiceover.',
      },
      {
        name: 'Talking head + B-roll cutaway',
        description: 'Hard cut from talking head into 1s B-roll every 5-7s.',
      },
    ],
    instagram: [
      {
        name: 'Carousel of single-stat slides',
        description: '8-10 slides, one stat per slide, ending on a CTA slide.',
      },
      {
        name: 'Reel with on-screen subtitles + zoom punches',
        description: 'Captions sized large; zoom punches on emphasis words.',
      },
    ],
    youtube: [
      {
        name: 'Cold-open hook → recap → main',
        description: '5-8s pre-intro clip showing the most dramatic moment.',
      },
      {
        name: 'Faceless explainer with stock B-roll',
        description: '60-90s short, voiceover only, AI-style B-roll.',
      },
    ],
    twitter: [
      {
        name: 'Threaded essay (7-10 tweets)',
        description: 'First tweet is the punchline. Subsequent tweets unpack it.',
      },
    ],
    linkedin: [
      {
        name: 'Personal-story carousel',
        description: '1500-2000 char post + 6-slide PDF carousel.',
      },
    ],
    facebook: [
      {
        name: 'Long-form video (3-5 min)',
        description: 'Story-driven, lead with the conflict, resolve at the end.',
      },
    ],
  };
  const formats = formatsByPlatform[platform] ?? [];
  return formats.map((f, i) => ({
    id: `baseline-format-${platform}-${i}`,
    platform,
    trend_type: 'format' as TrendType,
    score: 75 - i * 5,
    fetched_at: NOW(),
    expires_at: EXPIRES(),
    trend_data: f,
  }));
}

export function curatedBaselineTrends(platform: StrategyPlatform): Trend[] {
  return [
    ...baselineAudio(platform),
    ...baselineHashtags(platform),
    ...baselineFormats(platform),
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface GetTrendsOptions {
  platform?: StrategyPlatform;
  trendType?: TrendType;
  niche?: string;
  limit?: number;
}

/**
 * Read fresh trends from the cache. Falls back to curated baseline if the
 * cache is empty / expired / Supabase isn't reachable.
 */
export async function getTrends(opts: GetTrendsOptions = {}): Promise<Trend[]> {
  const limit = opts.limit ?? 30;
  let cached: Trend[] = [];

  try {
    const supabase = await createServerSupabaseClient();
    let q = supabase
      .from('trend_cache')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('score', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (opts.platform) q = q.eq('platform', opts.platform);
    if (opts.trendType) q = q.eq('trend_type', opts.trendType);
    if (opts.niche) q = q.or(`niche.eq.${opts.niche},niche.is.null`);

    const { data, error } = await q;
    if (!error && data) {
      cached = data.map(rowToTrend);
    }
  } catch {
    // ignore — fall through to baseline
  }

  if (cached.length > 0) return cached;

  // Baseline fallback
  const platforms: StrategyPlatform[] = opts.platform
    ? [opts.platform]
    : ['tiktok', 'instagram', 'youtube', 'twitter', 'linkedin', 'facebook'];
  const all = platforms.flatMap(curatedBaselineTrends);
  const filtered = opts.trendType ? all.filter((t) => t.trend_type === opts.trendType) : all;
  return filtered
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

interface TrendCacheRow {
  id: string;
  platform: StrategyPlatform;
  trend_type: TrendType;
  trend_data: Trend['trend_data'];
  niche: string | null;
  score: number | null;
  fetched_at: string;
  expires_at: string;
}

function rowToTrend(row: TrendCacheRow): Trend {
  return {
    id: row.id,
    platform: row.platform,
    trend_type: row.trend_type,
    niche: row.niche ?? undefined,
    score: row.score ?? undefined,
    fetched_at: row.fetched_at,
    expires_at: row.expires_at,
    trend_data: row.trend_data,
  };
}

/**
 * Placeholder for the eventual live ingest. Today this just returns the
 * curated baseline. When wired up, this should:
 *   1. Hit TikTok Creative Center / YouTube trending / IG Reels API.
 *   2. Normalize each result into a Trend.
 *   3. Upsert into trend_cache with an explicit expires_at.
 */
export async function fetchLiveTrends(
  platform: StrategyPlatform
): Promise<Trend[]> {
  return curatedBaselineTrends(platform);
}
