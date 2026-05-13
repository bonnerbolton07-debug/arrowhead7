// =============================================================================
// Arrowhead 7 — Strategy Brain Types
// =============================================================================
// Pillar 3. The algorithm-aware content strategy copilot.
//
// These types are shared between the engine (lib/strategy-brain/*), the API
// routes (app/api/strategy/*), and the dashboard UI (app/dashboard/strategy).
// =============================================================================

import type { UserId, EditId, StyleDNAId } from './edit';

/** Strategy Brain–specific platform list (no 'custom'). */
export type StrategyPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'linkedin';

export const STRATEGY_PLATFORMS: StrategyPlatform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
];

/** Content type taxonomy used by the calendar + recommendations. */
export type ContentType =
  | 'educational'
  | 'entertaining'
  | 'trending'
  | 'series'
  | 'promotional'
  | 'community';

/** Calendar slot lifecycle. */
export type CalendarStatus =
  | 'suggested'
  | 'confirmed'
  | 'in_progress'
  | 'published'
  | 'skipped';

/** A single AI-suggested or user-confirmed posting slot. */
export interface ContentCalendarEntry {
  id: string;
  user_id: UserId;

  scheduled_date: string;            // ISO timestamp
  platform: StrategyPlatform;
  content_type: ContentType;

  strategy_brief: StrategyBrief;

  style_dna_id?: StyleDNAId;
  edit_id?: EditId;

  status: CalendarStatus;
  ai_confidence?: number;            // 0-1

  created_at: string;
  updated_at: string;
}

/** Free-form AI brief attached to a calendar slot or recommendation. */
export interface StrategyBrief {
  title: string;
  topic: string;
  hook: string;                      // The opening line / first 1-3 seconds
  hook_pattern_id?: string;          // Reference into the hook library
  cta?: string;
  duration_seconds?: number;
  format: string;                    // 'short', 'long', 'carousel', 'live'
  recommended_audio?: TrendAudio;
  recommended_hashtags?: string[];
  notes?: string;
  reasoning?: string;                // Why this is recommended — visible to user
}

// ─── Trends ────────────────────────────────────────────────────────────────

export type TrendType = 'audio' | 'hashtag' | 'format' | 'topic' | 'effect';

export interface TrendBase {
  id: string;
  platform: StrategyPlatform;
  trend_type: TrendType;
  niche?: string;
  score?: number;                    // 0-100 ordering hint
  fetched_at: string;
  expires_at: string;
}

export interface TrendAudio {
  title: string;
  artist?: string;
  audio_url?: string;
  platform_audio_id?: string;
  uses_count?: number;
  growth_pct?: number;               // % growth over last 24h
}

export interface TrendHashtag {
  tag: string;                       // includes leading '#'
  post_count?: number;
  growth_pct?: number;
}

export interface TrendFormat {
  name: string;                      // e.g. "POV: ___", "Day in the life"
  description: string;
  example_creator?: string;
}

export interface TrendTopic {
  title: string;
  summary: string;
  source_url?: string;
}

export interface TrendEffect {
  name: string;
  description: string;
  platform_effect_id?: string;
}

export type TrendData =
  | TrendAudio
  | TrendHashtag
  | TrendFormat
  | TrendTopic
  | TrendEffect;

export interface Trend extends TrendBase {
  trend_data: TrendData;
}

// ─── Hook engineering library ──────────────────────────────────────────────

export type HookCategory =
  | 'curiosity'
  | 'value'
  | 'controversy'
  | 'storytelling'
  | 'pattern-interrupt'
  | 'authority'
  | 'visual-shock'
  | 'numbered-list';

export interface HookTemplate {
  id: string;
  name: string;
  category: HookCategory;
  pattern: string;                   // e.g. "The thing nobody tells you about [TOPIC]..."
  example: string;
  best_for_platforms: StrategyPlatform[];
  best_for_niches: string[];         // empty = all niches
  attention_seconds: number;         // typical hold time
  description: string;
}

// ─── Performance analysis ──────────────────────────────────────────────────

export interface ContentPerformanceRow {
  id: string;
  user_id: UserId;
  edit_id?: EditId;
  distribution_id?: string;
  calendar_id?: string;

  platform: StrategyPlatform;
  post_url?: string;

  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watch_time_seconds?: number;

  completion_rate?: number;          // 0-1
  engagement_rate?: number;          // 0-1

  topic?: string;
  format?: string;
  hook_pattern?: string;
  duration_seconds?: number;

  posted_at: string;
  metrics_fetched_at: string;
  created_at: string;
}

export interface PerformanceInsight {
  kind:
    | 'top_topic'
    | 'underperforming_topic'
    | 'best_format'
    | 'best_hook'
    | 'best_day'
    | 'best_hour'
    | 'platform_strength'
    | 'platform_weakness';
  label: string;                     // Short headline
  detail: string;                    // Plain-English explanation
  metric: number;                    // The number behind the claim (e.g. avg ER)
  confidence: number;                // 0-1
  evidence_count: number;            // How many posts this conclusion is based on
}

export interface PerformanceSummary {
  total_posts: number;
  average_engagement_rate: number;
  average_completion_rate: number;
  median_views: number;
  best_platform?: StrategyPlatform;
  insights: PerformanceInsight[];
  health_score: number;              // 0-100 overall strategy score
}

// ─── Recommendations ───────────────────────────────────────────────────────

export interface ContentRecommendation {
  id: string;                        // Stable per-day per-slot id
  priority: 'high' | 'medium' | 'low';
  platform: StrategyPlatform;
  content_type: ContentType;
  scheduled_for: string;             // ISO time the engine recommends posting
  brief: StrategyBrief;
  reasoning_chips: string[];         // Short tags shown on the card
  evidence: string[];                // Why we recommend this, plain English
  estimated_lift_pct?: number;       // vs. user's median performance
}

export interface RecommendationBundle {
  generated_at: string;
  for_user: UserId;
  next_best: ContentRecommendation[];
  health_score: number;              // Mirrors PerformanceSummary
}

// ─── Tier gating ───────────────────────────────────────────────────────────

import type { SubscriptionTier } from './channel';

export const STRATEGY_UNLOCKED_TIERS: SubscriptionTier[] = ['pro', 'enterprise'];

export function isStrategyUnlocked(tier: SubscriptionTier | null | undefined): boolean {
  if (!tier) return false;
  return STRATEGY_UNLOCKED_TIERS.includes(tier);
}
