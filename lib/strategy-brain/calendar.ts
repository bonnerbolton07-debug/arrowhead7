// =============================================================================
// Arrowhead 7 — Strategy Brain: Content Calendar AI
// =============================================================================
// Generates AI-suggested posting slots based on (a) platform best-practice
// cadences and (b) the user's historical best-performing day/hour windows.

import type {
  ContentCalendarEntry,
  ContentPerformanceRow,
  ContentType,
  StrategyBrief,
  StrategyPlatform,
} from '@/types/strategy';
import { engagementRate } from './analyzer';

// Sensible defaults when the user has no historical data yet. Times are UTC
// to avoid surprising the user — we display them in their local zone in the
// UI.
const PLATFORM_DEFAULTS: Record<
  StrategyPlatform,
  { posts_per_week: number; hours: number[]; days: number[] }
> = {
  // [0=Sun .. 6=Sat]
  tiktok:    { posts_per_week: 5, hours: [18, 21], days: [1, 2, 3, 4, 5] },
  instagram: { posts_per_week: 4, hours: [12, 19], days: [1, 3, 5, 6] },
  youtube:   { posts_per_week: 2, hours: [16, 20], days: [4, 6] },
  twitter:   { posts_per_week: 6, hours: [9, 13, 17], days: [1, 2, 3, 4, 5] },
  linkedin:  { posts_per_week: 3, hours: [8, 12, 17], days: [2, 3, 4] },
  facebook:  { posts_per_week: 2, hours: [11, 15], days: [3, 6] },
};

// Rotate through content types so the calendar feels varied.
const CONTENT_TYPE_ROTATION: ContentType[] = [
  'educational',
  'entertaining',
  'trending',
  'series',
  'community',
  'promotional',
];

export interface GenerateCalendarOptions {
  /** Window start, default = today (UTC midnight). */
  startDate?: Date;
  /** How many days forward to generate, default = 14. */
  days?: number;
  /** Limit which platforms to schedule for. */
  platforms?: StrategyPlatform[];
  /** Historical performance — informs preferred days/hours. */
  history?: ContentPerformanceRow[];
}

interface PreferredWindow {
  days: number[];
  hours: number[];
}

/** Learn preferred posting windows from history; fall back to defaults. */
function preferredWindow(
  platform: StrategyPlatform,
  history: ContentPerformanceRow[]
): PreferredWindow {
  const platformRows = history.filter((r) => r.platform === platform);
  if (platformRows.length < 4) {
    const d = PLATFORM_DEFAULTS[platform];
    return { days: d.days, hours: d.hours };
  }
  // Top 3 day-of-week by avg ER.
  const byDay = new Map<number, number[]>();
  const byHour = new Map<number, number[]>();
  for (const r of platformRows) {
    const dt = new Date(r.posted_at);
    const day = dt.getUTCDay();
    const hour = dt.getUTCHours();
    const er = engagementRate(r);
    if (!byDay.has(day)) byDay.set(day, []);
    if (!byHour.has(hour)) byHour.set(hour, []);
    byDay.get(day)!.push(er);
    byHour.get(hour)!.push(er);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const days = Array.from(byDay.entries())
    .sort((a, b) => avg(b[1]) - avg(a[1]))
    .slice(0, 3)
    .map(([d]) => d);
  const hours = Array.from(byHour.entries())
    .sort((a, b) => avg(b[1]) - avg(a[1]))
    .slice(0, 2)
    .map(([h]) => h);
  // If learned set is sparse, mix in the defaults.
  const def = PLATFORM_DEFAULTS[platform];
  return {
    days: days.length >= 2 ? days : def.days,
    hours: hours.length >= 1 ? hours : def.hours,
  };
}

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * Generate a flat list of AI-suggested calendar slots over the given window.
 *
 * The output is unsaved — the API route persists what the user confirms.
 */
export function generateCalendarSuggestions(
  userId: string,
  opts: GenerateCalendarOptions = {}
): ContentCalendarEntry[] {
  const start = startOfDayUTC(opts.startDate ?? new Date());
  const days = opts.days ?? 14;
  const platforms =
    opts.platforms && opts.platforms.length > 0
      ? opts.platforms
      : (['tiktok', 'instagram', 'youtube'] as StrategyPlatform[]);
  const history = opts.history ?? [];

  const entries: ContentCalendarEntry[] = [];
  let rotationIndex = 0;

  for (const platform of platforms) {
    const window = preferredWindow(platform, history);
    const cadence = PLATFORM_DEFAULTS[platform].posts_per_week;
    // Roughly evenly space N slots across the window.
    const targetSlots = Math.max(1, Math.round((cadence * days) / 7));

    let placed = 0;
    for (let i = 0; i < days && placed < targetSlots; i += 1) {
      const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dow = day.getUTCDay();
      if (!window.days.includes(dow)) continue;
      const hour = window.hours[placed % window.hours.length];
      day.setUTCHours(hour, 0, 0, 0);

      const contentType =
        CONTENT_TYPE_ROTATION[rotationIndex % CONTENT_TYPE_ROTATION.length];
      rotationIndex += 1;
      placed += 1;

      entries.push({
        id: `suggested-${platform}-${day.toISOString()}-${contentType}`,
        user_id: userId,
        scheduled_date: day.toISOString(),
        platform,
        content_type: contentType,
        strategy_brief: defaultBriefForSlot(platform, contentType),
        status: 'suggested',
        ai_confidence: history.length >= 4 ? 0.8 : 0.55,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  entries.sort(
    (a, b) =>
      new Date(a.scheduled_date).getTime() -
      new Date(b.scheduled_date).getTime()
  );
  return entries;
}

function defaultBriefForSlot(
  platform: StrategyPlatform,
  contentType: ContentType
): StrategyBrief {
  const titles: Record<ContentType, string> = {
    educational: 'Teach one thing in under 60s',
    entertaining: 'Behind-the-scenes moment',
    trending: 'Ride a trending audio or format',
    series: 'Continue your running series',
    community: 'Reply to your top comment in video',
    promotional: 'Spotlight one product / offer',
  };
  const format: Record<StrategyPlatform, string> = {
    tiktok: 'short',
    instagram: 'short',
    youtube: 'short',
    twitter: 'thread',
    linkedin: 'carousel',
    facebook: 'long',
  };
  return {
    title: titles[contentType],
    topic: titles[contentType],
    hook: '',
    format: format[platform],
    notes:
      'Strategy Brain pre-filled this slot. Open it to confirm the topic and hook.',
  };
}

/** Compact week view used by the UI — groups entries into [dayIndex][platform]. */
export function bucketByDay(
  entries: ContentCalendarEntry[],
  startDate: Date,
  days = 7
): ContentCalendarEntry[][] {
  const buckets: ContentCalendarEntry[][] = Array.from({ length: days }, () => []);
  const start = startOfDayUTC(startDate).getTime();
  for (const e of entries) {
    const diff = Math.floor(
      (new Date(e.scheduled_date).getTime() - start) / (24 * 60 * 60 * 1000)
    );
    if (diff >= 0 && diff < days) buckets[diff].push(e);
  }
  return buckets;
}
