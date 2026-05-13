// =============================================================================
// Arrowhead 7 — Feature Gating Helpers
// =============================================================================
// Pure functions that read TIER_LIMITS and answer "can this user do X?".
// Use these throughout the app instead of hardcoding tier checks. No Stripe
// SDK calls — this module is the read side of subscriptions. Webhooks update
// the profile row; every product-side check goes through one of the helpers
// below.

import { TIER_LIMITS, type SubscriptionTier, type TierLimit } from '@/types';

/**
 * Render output resolution — the operational vocabulary used by the editor,
 * Style DNA matcher, and Shotstack client. Distinct from the marketing tier
 * resolution labels stored on TierLimit.max_resolution.
 */
export type Resolution = 'sd' | 'hd' | '1080' | '4k';

/** Map render resolutions and tier max_resolution labels to a single rank. */
const RESOLUTION_RANK: Record<Resolution, number> = {
  sd: 0,
  hd: 1,
  '1080': 2,
  '4k': 3,
};

const TIER_MAX_RESOLUTION_RANK: Record<TierLimit['max_resolution'], number> = {
  '720': 1, // 720p ≈ HD
  '1080': 2,
  '4k': 3,
  '4k-hdr': 4,
};

/**
 * Coerce any tier value (including external aliases and `null`) into a known
 * `SubscriptionTier`. Unknown inputs default to `free`.
 *
 *   starter      → free
 *   creator      → pro
 *   enterprise   → studio
 */
export function normalizeTier(
  tier: string | null | undefined
): SubscriptionTier {
  if (!tier) return 'free';
  const t = tier.toLowerCase();
  if (t === 'starter') return 'free';
  if (t === 'creator') return 'pro';
  if (t === 'enterprise') return 'studio';
  if (t === 'free' || t === 'pro' || t === 'studio') return t;
  return 'free';
}

export function getTierLimits(
  tier: SubscriptionTier | string | null | undefined
): TierLimit {
  return TIER_LIMITS[normalizeTier(tier)];
}

/** Is the user allowed to render at this resolution? */
export function canUseResolution(
  tier: SubscriptionTier | string | null | undefined,
  resolution: Resolution
): boolean {
  const max = getTierLimits(tier).max_resolution;
  return RESOLUTION_RANK[resolution] <= TIER_MAX_RESOLUTION_RANK[max];
}

/** Highest output resolution this tier may select (operational label). */
export function highestAllowedResolution(
  tier: SubscriptionTier | string | null | undefined
): Resolution {
  const max = getTierLimits(tier).max_resolution;
  switch (max) {
    case '720':
      return 'hd';
    case '1080':
      return '1080';
    case '4k':
    case '4k-hdr':
      return '4k';
  }
}

/** Tier's max video duration in seconds. */
export function maxDurationSec(
  tier: SubscriptionTier | string | null | undefined
): number {
  const ms = getTierLimits(tier).max_video_duration_ms;
  return ms === -1 ? -1 : Math.floor(ms / 1000);
}

/** Is the requested duration permitted? */
export function canUseDuration(
  tier: SubscriptionTier | string | null | undefined,
  durationSec: number
): boolean {
  const max = maxDurationSec(tier);
  if (max === -1) return true;
  return durationSec <= max;
}

/** Must the export carry the "Made with A7" watermark? */
export function requiresWatermark(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).watermark;
}

/** Does the tier include auto-captions (Whisper transcription)? */
export function canUseAutoCaptions(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).auto_captions;
}

/** Does the tier include the Strategy Brain (title/thumbnail/hook AI)? */
export function hasStrategyBrain(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).strategy_brain;
}

/** Is API access enabled (Studio tier)? */
export function hasApiAccess(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).api_access;
}

/** Team collaboration (Studio tier). */
export function hasTeamCollaboration(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).team_collaboration;
}

/** Does the user get priority rendering? */
export function hasPriorityRendering(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).priority_rendering;
}

/** Monthly edit allotment. -1 means unlimited. */
export function editsPerMonth(
  tier: SubscriptionTier | string | null | undefined
): number {
  return getTierLimits(tier).credits_per_month;
}

/** Can the user perform another edit given current usage? */
export function canCreateEdit(
  tier: SubscriptionTier | string | null | undefined,
  creditsRemaining: number,
  activeEdits = 0
): { allowed: boolean; reason?: string } {
  const limits = getTierLimits(tier);
  const allotment = limits.credits_per_month;
  if (allotment !== -1 && creditsRemaining <= 0) {
    return {
      allowed: false,
      reason: `You've used all ${allotment} edits in your ${normalizeTier(
        tier
      )} plan this month. Upgrade for more.`,
    };
  }
  if (
    limits.max_concurrent_edits !== -1 &&
    activeEdits >= limits.max_concurrent_edits
  ) {
    return {
      allowed: false,
      reason: `Your ${normalizeTier(tier)} plan allows ${limits.max_concurrent_edits} concurrent edit${
        limits.max_concurrent_edits === 1 ? '' : 's'
      }. Wait for one to finish or upgrade.`,
    };
  }
  return { allowed: true };
}

/** Can the user connect another channel? */
export function canConnectAnotherChannel(
  tier: SubscriptionTier | string | null | undefined,
  currentChannelCount: number
): { allowed: boolean; reason?: string } {
  const max = getTierLimits(tier).max_channels;
  if (max === -1) return { allowed: true };
  if (currentChannelCount >= max) {
    return {
      allowed: false,
      reason: `${normalizeTier(tier)} plan supports ${max} connected channel${max === 1 ? '' : 's'}. Upgrade to add more.`,
    };
  }
  return { allowed: true };
}

/** Can the user create another Style DNA profile? */
export function canCreateStyleDna(
  tier: SubscriptionTier | string | null | undefined,
  currentCount: number
): { allowed: boolean; reason?: string } {
  const max = getTierLimits(tier).style_dna_slots;
  if (max === -1) return { allowed: true };
  if (currentCount >= max) {
    return {
      allowed: false,
      reason: `${normalizeTier(tier)} plan supports ${max} Style DNA profile${max === 1 ? '' : 's'}. Upgrade to save more.`,
    };
  }
  return { allowed: true };
}

/** Format an unlimited / numeric quota for display. */
export function formatQuota(value: number, suffix = ''): string {
  if (value === -1) return 'Unlimited';
  return suffix ? `${value} ${suffix}` : String(value);
}
