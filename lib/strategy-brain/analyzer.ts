// =============================================================================
// Arrowhead 7 — Strategy Brain: Performance Analyzer
// =============================================================================
// Pure functions over content_performance rows. No DB calls in here — callers
// (API routes, recommendation engine) fetch rows and pass them in. That keeps
// the engine testable and free of Supabase coupling.

import type {
  ContentPerformanceRow,
  PerformanceInsight,
  PerformanceSummary,
  StrategyPlatform,
} from '@/types/strategy';

// ─── Stats helpers ────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function safeRatio(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

/** Engagement rate: (likes + comments + shares + saves) / views. */
export function engagementRate(row: ContentPerformanceRow): number {
  if (typeof row.engagement_rate === 'number') return row.engagement_rate;
  const engaged = row.likes + row.comments + row.shares + row.saves;
  return safeRatio(engaged, row.views);
}

/** Completion rate falls back to watch_time / duration when not provided. */
export function completionRate(row: ContentPerformanceRow): number {
  if (typeof row.completion_rate === 'number') return row.completion_rate;
  if (row.watch_time_seconds && row.duration_seconds) {
    return Math.min(
      1,
      safeRatio(row.watch_time_seconds, row.duration_seconds * Math.max(row.views, 1))
    );
  }
  return 0;
}

// ─── Grouped insights ─────────────────────────────────────────────────────

interface GroupStats {
  key: string;
  count: number;
  avg_er: number;
  avg_completion: number;
  median_views: number;
}

function groupBy(
  rows: ContentPerformanceRow[],
  keyFn: (r: ContentPerformanceRow) => string | undefined
): GroupStats[] {
  const buckets = new Map<string, ContentPerformanceRow[]>();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  return Array.from(buckets.entries()).map(([key, rs]) => ({
    key,
    count: rs.length,
    avg_er: mean(rs.map(engagementRate)),
    avg_completion: mean(rs.map(completionRate)),
    median_views: median(rs.map((r) => r.views)),
  }));
}

// Wilson-ish confidence damp: more rows = more confidence, capped at 0.95.
function confidenceForCount(n: number): number {
  if (n <= 1) return 0.25;
  if (n <= 3) return 0.45;
  if (n <= 6) return 0.65;
  if (n <= 12) return 0.8;
  return 0.95;
}

function topAndBottomTopic(rows: ContentPerformanceRow[]): PerformanceInsight[] {
  const groups = groupBy(rows, (r) => r.topic?.toLowerCase()).filter((g) => g.count >= 2);
  if (groups.length === 0) return [];
  const sorted = [...groups].sort((a, b) => b.avg_er - a.avg_er);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const out: PerformanceInsight[] = [
    {
      kind: 'top_topic',
      label: `"${top.key}" outperforms`,
      detail: `Your "${top.key}" posts average ${(top.avg_er * 100).toFixed(1)}% engagement across ${top.count} posts.`,
      metric: top.avg_er,
      confidence: confidenceForCount(top.count),
      evidence_count: top.count,
    },
  ];
  if (bottom && bottom.key !== top.key) {
    out.push({
      kind: 'underperforming_topic',
      label: `"${bottom.key}" lags`,
      detail: `Your "${bottom.key}" posts average ${(bottom.avg_er * 100).toFixed(1)}% engagement — consider pivoting.`,
      metric: bottom.avg_er,
      confidence: confidenceForCount(bottom.count),
      evidence_count: bottom.count,
    });
  }
  return out;
}

function bestFormat(rows: ContentPerformanceRow[]): PerformanceInsight | null {
  const groups = groupBy(rows, (r) => r.format).filter((g) => g.count >= 2);
  if (groups.length === 0) return null;
  const top = [...groups].sort((a, b) => b.avg_completion - a.avg_completion)[0];
  return {
    kind: 'best_format',
    label: `${top.key} holds attention`,
    detail: `${top.key} posts retain ${(top.avg_completion * 100).toFixed(0)}% of viewers on average (${top.count} posts).`,
    metric: top.avg_completion,
    confidence: confidenceForCount(top.count),
    evidence_count: top.count,
  };
}

function bestHook(rows: ContentPerformanceRow[]): PerformanceInsight | null {
  const groups = groupBy(rows, (r) => r.hook_pattern).filter((g) => g.count >= 2);
  if (groups.length === 0) return null;
  const top = [...groups].sort((a, b) => b.avg_er - a.avg_er)[0];
  return {
    kind: 'best_hook',
    label: `${top.key} hook wins`,
    detail: `Posts using the "${top.key}" hook average ${(top.avg_er * 100).toFixed(1)}% engagement.`,
    metric: top.avg_er,
    confidence: confidenceForCount(top.count),
    evidence_count: top.count,
  };
}

function bestDayHour(rows: ContentPerformanceRow[]): PerformanceInsight[] {
  if (rows.length < 4) return [];
  const dayGroups = groupBy(rows, (r) => {
    const d = new Date(r.posted_at).getUTCDay();
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d];
  });
  const hourGroups = groupBy(rows, (r) => {
    const h = new Date(r.posted_at).getUTCHours();
    return String(h);
  });

  const out: PerformanceInsight[] = [];
  if (dayGroups.length > 0) {
    const topDay = [...dayGroups].sort((a, b) => b.median_views - a.median_views)[0];
    out.push({
      kind: 'best_day',
      label: `${topDay.key} performs best`,
      detail: `${topDay.key} posts pull a median of ${Math.round(topDay.median_views).toLocaleString()} views.`,
      metric: topDay.median_views,
      confidence: confidenceForCount(topDay.count),
      evidence_count: topDay.count,
    });
  }
  if (hourGroups.length > 0) {
    const topHour = [...hourGroups].sort((a, b) => b.median_views - a.median_views)[0];
    const h = Number(topHour.key);
    const label = `${h.toString().padStart(2, '0')}:00 UTC`;
    out.push({
      kind: 'best_hour',
      label: `${label} is your sweet spot`,
      detail: `Posts published around ${label} reach a median ${Math.round(topHour.median_views).toLocaleString()} views.`,
      metric: topHour.median_views,
      confidence: confidenceForCount(topHour.count),
      evidence_count: topHour.count,
    });
  }
  return out;
}

function platformInsights(rows: ContentPerformanceRow[]): {
  best?: StrategyPlatform;
  insights: PerformanceInsight[];
} {
  const groups = groupBy(rows, (r) => r.platform);
  if (groups.length === 0) return { insights: [] };
  const sorted = [...groups].sort((a, b) => b.avg_er - a.avg_er);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const insights: PerformanceInsight[] = [
    {
      kind: 'platform_strength',
      label: `${best.key.toUpperCase()} is your strongest channel`,
      detail: `${best.key} averages ${(best.avg_er * 100).toFixed(1)}% engagement across ${best.count} posts.`,
      metric: best.avg_er,
      confidence: confidenceForCount(best.count),
      evidence_count: best.count,
    },
  ];
  if (worst && worst.key !== best.key) {
    insights.push({
      kind: 'platform_weakness',
      label: `${worst.key.toUpperCase()} needs attention`,
      detail: `${worst.key} only averages ${(worst.avg_er * 100).toFixed(1)}% engagement — try a different format mix here.`,
      metric: worst.avg_er,
      confidence: confidenceForCount(worst.count),
      evidence_count: worst.count,
    });
  }
  return { best: best.key as StrategyPlatform, insights };
}

// ─── Public: full summary ─────────────────────────────────────────────────

/**
 * Compute a complete strategy summary from a list of performance rows.
 *
 * Returns sane defaults (zeros, empty insights) when given an empty list,
 * so the dashboard can render an "onboarding" state without special-casing.
 */
export function analyzePerformance(
  rows: ContentPerformanceRow[]
): PerformanceSummary {
  if (rows.length === 0) {
    return {
      total_posts: 0,
      average_engagement_rate: 0,
      average_completion_rate: 0,
      median_views: 0,
      best_platform: undefined,
      insights: [],
      health_score: 0,
    };
  }

  const ers = rows.map(engagementRate);
  const completions = rows.map(completionRate);
  const views = rows.map((r) => r.views);

  const { best, insights: platformIs } = platformInsights(rows);
  const insights: PerformanceInsight[] = [
    ...topAndBottomTopic(rows),
    ...platformIs,
  ];
  const bestFmt = bestFormat(rows);
  if (bestFmt) insights.push(bestFmt);
  const bestHookI = bestHook(rows);
  if (bestHookI) insights.push(bestHookI);
  insights.push(...bestDayHour(rows));

  return {
    total_posts: rows.length,
    average_engagement_rate: mean(ers),
    average_completion_rate: mean(completions),
    median_views: median(views),
    best_platform: best,
    insights,
    health_score: computeHealthScore(rows),
  };
}

// ─── Health score ─────────────────────────────────────────────────────────

/**
 * Strategy health score (0-100). Composite of:
 *   - Consistency: are you posting regularly?
 *   - Engagement: average ER vs. baseline
 *   - Reach trend: median views recent vs. older
 *   - Platform diversity: posting on more than one channel
 */
export function computeHealthScore(rows: ContentPerformanceRow[]): number {
  if (rows.length === 0) return 0;

  const sorted = [...rows].sort(
    (a, b) => new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime()
  );

  // 1) Consistency: posts per week over the active window (max 30 pts).
  const first = new Date(sorted[0].posted_at).getTime();
  const last = new Date(sorted[sorted.length - 1].posted_at).getTime();
  const weeks = Math.max(1, (last - first) / (7 * 24 * 60 * 60 * 1000));
  const perWeek = rows.length / weeks;
  // 3+ posts/week saturates.
  const consistencyPts = Math.min(30, (perWeek / 3) * 30);

  // 2) Engagement: avg ER (max 30 pts; 5% ER = full marks).
  const avgEr = mean(rows.map(engagementRate));
  const engagementPts = Math.min(30, (avgEr / 0.05) * 30);

  // 3) Reach trend: recent half vs. older half (max 20 pts).
  let reachPts = 10;
  if (sorted.length >= 4) {
    const half = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, half).map((r) => r.views);
    const newer = sorted.slice(half).map((r) => r.views);
    const ratio = safeRatio(mean(newer), Math.max(1, mean(older)));
    reachPts = Math.max(0, Math.min(20, ratio * 10));
  }

  // 4) Platform diversity (max 20 pts; 3+ platforms saturates).
  const distinctPlatforms = new Set(rows.map((r) => r.platform)).size;
  const diversityPts = Math.min(20, (distinctPlatforms / 3) * 20);

  return Math.round(consistencyPts + engagementPts + reachPts + diversityPts);
}
