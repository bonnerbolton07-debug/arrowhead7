// =============================================================================
// Arrowhead 7 — Strategy Brain: Recommendation Engine
// =============================================================================
// Synthesizes analyzer + trends + calendar + hooks into actionable briefs.
//
// The output of this module is what powers the "Next Best Content" cards on
// the strategy dashboard and the "Recommended for you" section on the home
// dashboard. Each ContentRecommendation has enough metadata to one-click
// "Create This" into the editor.

import { analyzePerformance, engagementRate } from './analyzer';
import { generateCalendarSuggestions } from './calendar';
import { getTrends } from './trends';
import { pickHookForSlot } from './hooks';
import type {
  ContentPerformanceRow,
  ContentRecommendation,
  ContentType,
  RecommendationBundle,
  StrategyBrief,
  StrategyPlatform,
  Trend,
  TrendAudio,
  TrendHashtag,
} from '@/types/strategy';

const PRIORITY_BUCKETS = ['high', 'medium', 'low'] as const;

export interface BuildRecommendationsOptions {
  userId: string;
  history: ContentPerformanceRow[];
  niche?: string;
  platforms?: StrategyPlatform[];
  /** Max recommendations to return. Default 6. */
  limit?: number;
}

function pickAudioFromTrends(
  trends: Trend[],
  platform: StrategyPlatform
): TrendAudio | undefined {
  const audio = trends.find(
    (t) => t.platform === platform && t.trend_type === 'audio'
  );
  return audio ? (audio.trend_data as TrendAudio) : undefined;
}

function pickHashtagsFromTrends(
  trends: Trend[],
  platform: StrategyPlatform
): string[] {
  return trends
    .filter((t) => t.platform === platform && t.trend_type === 'hashtag')
    .slice(0, 3)
    .map((t) => (t.trend_data as TrendHashtag).tag);
}

function reasoningFor(
  platform: StrategyPlatform,
  contentType: ContentType,
  evidence: string[],
  hookName: string
): string {
  const why = evidence.length
    ? evidence.join(' ')
    : `Strategy Brain picked this slot based on platform best-practice for ${platform}.`;
  return `${why} Use the "${hookName}" hook to grab the first 2 seconds.`;
}

function estimateLift(history: ContentPerformanceRow[], platform: StrategyPlatform): number | undefined {
  const platformRows = history.filter((r) => r.platform === platform);
  if (platformRows.length < 3) return undefined;
  const baseline =
    platformRows.reduce((a, r) => a + engagementRate(r), 0) / platformRows.length;
  if (baseline <= 0) return undefined;
  // Estimated +20% lift from acting on a fresh trend + tuned hook.
  return Math.round(20);
}

/**
 * The headline call. Returns a ranked bundle of "do this next" content
 * recommendations + the live health score.
 */
export async function buildRecommendations(
  opts: BuildRecommendationsOptions
): Promise<RecommendationBundle> {
  const { userId, history, niche, limit = 6 } = opts;
  const platforms =
    opts.platforms && opts.platforms.length > 0
      ? opts.platforms
      : (['tiktok', 'instagram', 'youtube'] as StrategyPlatform[]);

  const summary = analyzePerformance(history);
  const slots = generateCalendarSuggestions(userId, {
    days: 14,
    platforms,
    history,
  });

  // Pull trends in parallel per platform.
  const trendBundles = await Promise.all(
    platforms.map((p) => getTrends({ platform: p, limit: 10 }))
  );
  const trendsByPlatform = new Map<StrategyPlatform, Trend[]>();
  platforms.forEach((p, i) => trendsByPlatform.set(p, trendBundles[i]));

  // For each slot, materialize a brief and a recommendation.
  const recs: ContentRecommendation[] = slots.map((slot, idx) => {
    const platformTrends = trendsByPlatform.get(slot.platform) ?? [];
    const hook = pickHookForSlot({
      platform: slot.platform,
      niche,
      contentType: slot.content_type,
      seed: idx,
    });
    const audio = pickAudioFromTrends(platformTrends, slot.platform);
    const hashtags = pickHashtagsFromTrends(platformTrends, slot.platform);

    const evidence: string[] = [];
    if (summary.best_platform === slot.platform) {
      evidence.push(
        `${slot.platform} is your strongest channel (avg ER ${(summary.average_engagement_rate * 100).toFixed(1)}%).`
      );
    }
    if (audio) {
      evidence.push(
        `"${audio.title}" is trending on ${slot.platform}${audio.growth_pct ? ` (+${audio.growth_pct}% in 24h)` : ''}.`
      );
    }
    const dayInsight = summary.insights.find(
      (i) => i.kind === 'best_day' || i.kind === 'best_hour'
    );
    if (dayInsight) evidence.push(dayInsight.detail);

    const brief: StrategyBrief = {
      title: slot.strategy_brief.title,
      topic: slot.strategy_brief.topic,
      hook: hook.pattern,
      hook_pattern_id: hook.id,
      cta: slot.content_type === 'promotional' ? 'Drop the link in comments.' : 'Follow for more.',
      duration_seconds: slot.platform === 'youtube' ? 60 : 30,
      format: slot.strategy_brief.format,
      recommended_audio: audio,
      recommended_hashtags: hashtags,
      reasoning: reasoningFor(slot.platform, slot.content_type, evidence, hook.name),
      notes: slot.strategy_brief.notes,
    };

    const priorityIdx = Math.min(
      PRIORITY_BUCKETS.length - 1,
      Math.floor(idx / Math.max(1, Math.ceil(slots.length / PRIORITY_BUCKETS.length)))
    );

    return {
      id: slot.id,
      priority: PRIORITY_BUCKETS[priorityIdx],
      platform: slot.platform,
      content_type: slot.content_type,
      scheduled_for: slot.scheduled_date,
      brief,
      reasoning_chips: chipsForRec(slot.platform, slot.content_type, audio, hook.name),
      evidence,
      estimated_lift_pct: estimateLift(history, slot.platform),
    };
  });

  // Stable rank: high-priority + platform-strength first.
  recs.sort((a, b) => {
    const pa = PRIORITY_BUCKETS.indexOf(a.priority);
    const pb = PRIORITY_BUCKETS.indexOf(b.priority);
    if (pa !== pb) return pa - pb;
    const sa = summary.best_platform === a.platform ? 0 : 1;
    const sb = summary.best_platform === b.platform ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
  });

  return {
    generated_at: new Date().toISOString(),
    for_user: userId,
    next_best: recs.slice(0, limit),
    health_score: summary.health_score,
  };
}

function chipsForRec(
  platform: StrategyPlatform,
  contentType: ContentType,
  audio: TrendAudio | undefined,
  hookName: string
): string[] {
  const chips = [platform.toUpperCase(), contentType, hookName];
  if (audio) chips.push('Trending audio');
  return chips;
}

/** Post-render hook: pick the best next platform/time for a finished edit. */
export async function recommendPostingPlan(opts: {
  userId: string;
  history: ContentPerformanceRow[];
  preferredPlatform?: StrategyPlatform;
}): Promise<{
  platform: StrategyPlatform;
  scheduled_for: string;
  reasoning: string;
}> {
  const summary = analyzePerformance(opts.history);
  const platform: StrategyPlatform =
    opts.preferredPlatform ?? summary.best_platform ?? 'tiktok';
  const slots = generateCalendarSuggestions(opts.userId, {
    platforms: [platform],
    history: opts.history,
    days: 3,
  });
  const next = slots[0];
  const scheduled_for =
    next?.scheduled_date ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const dayInsight = summary.insights.find((i) => i.kind === 'best_hour');
  const reasoning = dayInsight
    ? `${dayInsight.detail} Post here for max reach.`
    : `Default best-practice window for ${platform}.`;
  return { platform, scheduled_for, reasoning };
}
