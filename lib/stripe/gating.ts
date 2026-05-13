// =============================================================================
// Arrowhead 7 — Subscription Tier Gating
// =============================================================================
// Pure functions for evaluating what a tier may do. No Stripe SDK calls — this
// module is the read side of subscriptions. Webhooks update the profile row;
// every product-side check goes through one of the helpers below.

export type Resolution = 'sd' | 'hd' | '1080' | '4k';

/**
 * Canonical tier names stored on `profiles.subscription_tier`.
 *
 * Aliases accepted by `normalizeTier` (so external label changes don't break
 * gating): starter→free, studio→enterprise.
 */
export type SubscriptionTier = 'free' | 'creator' | 'pro' | 'enterprise';

export interface TierLimits {
  /** Maximum monthly credits. -1 = unlimited. */
  creditsPerMonth: number;
  /** Highest output resolution this tier may select. */
  maxResolution: Resolution;
  /** Maximum source / output duration in seconds. */
  maxDurationSec: number;
  /** Connected publishing channels. -1 = unlimited. */
  maxChannels: number;
  /** Stored Style DNA profiles. -1 = unlimited. */
  styleDnaSlots: number;
  /** Concurrent edits allowed in the queue. -1 = unlimited. */
  maxConcurrentEdits: number;
  /** Render queue priority — Pro/Studio jump the queue. */
  priorityRender: boolean;
  /** Auto-captions are gated behind a paid tier. */
  autoCaptions: boolean;
  /** Render output stamped with "Made with A7". */
  watermark: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    creditsPerMonth: 3,
    maxResolution: 'hd',
    maxDurationSec: 60,
    maxChannels: 1,
    styleDnaSlots: 1,
    maxConcurrentEdits: 1,
    priorityRender: false,
    autoCaptions: false,
    watermark: true,
  },
  creator: {
    creditsPerMonth: 25,
    maxResolution: '1080',
    maxDurationSec: 300,
    maxChannels: 3,
    styleDnaSlots: 5,
    maxConcurrentEdits: 2,
    priorityRender: false,
    autoCaptions: true,
    watermark: false,
  },
  pro: {
    creditsPerMonth: 100,
    maxResolution: '4k',
    maxDurationSec: 900,
    maxChannels: 10,
    styleDnaSlots: 20,
    maxConcurrentEdits: 5,
    priorityRender: true,
    autoCaptions: true,
    watermark: false,
  },
  enterprise: {
    creditsPerMonth: -1,
    maxResolution: '4k',
    maxDurationSec: 3600,
    maxChannels: -1,
    styleDnaSlots: -1,
    maxConcurrentEdits: -1,
    priorityRender: true,
    autoCaptions: true,
    watermark: false,
  },
};

const RESOLUTION_RANK: Record<Resolution, number> = {
  sd: 1,
  hd: 2,
  '1080': 3,
  '4k': 4,
};

/**
 * Coerce any tier value (including external aliases and `null`) into a known
 * `SubscriptionTier`. Unknown inputs default to `free` — the safe choice for
 * gating reads.
 */
export function normalizeTier(
  tier: string | null | undefined
): SubscriptionTier {
  if (!tier) return 'free';
  const t = tier.toLowerCase();
  if (t === 'starter') return 'free';
  if (t === 'studio') return 'enterprise';
  if (t === 'free' || t === 'creator' || t === 'pro' || t === 'enterprise') {
    return t;
  }
  return 'free';
}

export function getTierLimits(
  tier: SubscriptionTier | string | null | undefined
): TierLimits {
  return TIER_LIMITS[normalizeTier(tier)];
}

export function requiresWatermark(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).watermark;
}

export function canUseResolution(
  tier: SubscriptionTier | string | null | undefined,
  resolution: Resolution
): boolean {
  return RESOLUTION_RANK[resolution] <= RESOLUTION_RANK[getTierLimits(tier).maxResolution];
}

export function canUseAutoCaptions(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return getTierLimits(tier).autoCaptions;
}

export function canUseDuration(
  tier: SubscriptionTier | string | null | undefined,
  durationSec: number
): boolean {
  return durationSec <= getTierLimits(tier).maxDurationSec;
}

export interface CanCreateEditInput {
  tier: SubscriptionTier | string | null | undefined;
  creditsRemaining: number;
  activeEdits: number;
}

export interface CanCreateEditResult {
  allowed: boolean;
  reason?: 'insufficient_credits' | 'concurrent_limit';
}

export function canCreateEdit(input: CanCreateEditInput): CanCreateEditResult {
  const limits = getTierLimits(input.tier);
  if (limits.creditsPerMonth !== -1 && input.creditsRemaining <= 0) {
    return { allowed: false, reason: 'insufficient_credits' };
  }
  if (
    limits.maxConcurrentEdits !== -1 &&
    input.activeEdits >= limits.maxConcurrentEdits
  ) {
    return { allowed: false, reason: 'concurrent_limit' };
  }
  return { allowed: true };
}

export function highestAllowedResolution(
  tier: SubscriptionTier | string | null | undefined
): Resolution {
  return getTierLimits(tier).maxResolution;
}
