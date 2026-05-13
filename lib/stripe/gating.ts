// =============================================================================
// Arrowhead 7 — Feature Gating Helpers
// =============================================================================
// Pure functions that read TIER_LIMITS and answer "can this user do X?".
// Use these throughout the app instead of hardcoding tier checks.

import { TIER_LIMITS, type SubscriptionTier } from '@/types';

export type Resolution = '720' | '1080' | '4k' | '4k-hdr';

const RESOLUTION_RANK: Record<Resolution, number> = {
  '720': 0,
  '1080': 1,
  '4k': 2,
  '4k-hdr': 3,
};

/** Is the user allowed to render at this resolution? */
export function canUseResolution(tier: SubscriptionTier, resolution: Resolution): boolean {
  const max = TIER_LIMITS[tier].max_resolution;
  return RESOLUTION_RANK[resolution] <= RESOLUTION_RANK[max];
}

/** Highest resolution this tier may export. */
export function maxResolution(tier: SubscriptionTier): Resolution {
  return TIER_LIMITS[tier].max_resolution;
}

/** Must the export carry the "Made with A7" watermark? */
export function requiresWatermark(tier: SubscriptionTier): boolean {
  return TIER_LIMITS[tier].watermark;
}

/** Does the tier include the Strategy Brain (title/thumbnail/hook AI)? */
export function hasStrategyBrain(tier: SubscriptionTier): boolean {
  return TIER_LIMITS[tier].strategy_brain;
}

/** Is API access enabled (Studio tier)? */
export function hasApiAccess(tier: SubscriptionTier): boolean {
  return TIER_LIMITS[tier].api_access;
}

/** Team collaboration (Studio tier). */
export function hasTeamCollaboration(tier: SubscriptionTier): boolean {
  return TIER_LIMITS[tier].team_collaboration;
}

/** Does the user get priority rendering? */
export function hasPriorityRendering(tier: SubscriptionTier): boolean {
  return TIER_LIMITS[tier].priority_rendering;
}

/** Monthly edit allotment. -1 means unlimited. */
export function editsPerMonth(tier: SubscriptionTier): number {
  return TIER_LIMITS[tier].credits_per_month;
}

/** Can the user perform another edit given current usage? */
export function canCreateEdit(
  tier: SubscriptionTier,
  creditsRemaining: number
): { allowed: boolean; reason?: string } {
  const allotment = editsPerMonth(tier);
  if (allotment === -1) return { allowed: true };
  if (creditsRemaining <= 0) {
    return {
      allowed: false,
      reason: `You've used all ${allotment} edits in your ${tier} plan this month. Upgrade for more.`,
    };
  }
  return { allowed: true };
}

/** Can the user connect another channel? */
export function canConnectAnotherChannel(
  tier: SubscriptionTier,
  currentChannelCount: number
): { allowed: boolean; reason?: string } {
  const max = TIER_LIMITS[tier].max_channels;
  if (max === -1) return { allowed: true };
  if (currentChannelCount >= max) {
    return {
      allowed: false,
      reason: `${tier} plan supports ${max} connected channel${max === 1 ? '' : 's'}. Upgrade to add more.`,
    };
  }
  return { allowed: true };
}

/** Can the user create another Style DNA profile? */
export function canCreateStyleDna(
  tier: SubscriptionTier,
  currentCount: number
): { allowed: boolean; reason?: string } {
  const max = TIER_LIMITS[tier].style_dna_slots;
  if (max === -1) return { allowed: true };
  if (currentCount >= max) {
    return {
      allowed: false,
      reason: `${tier} plan supports ${max} Style DNA profile${max === 1 ? '' : 's'}. Upgrade to save more.`,
    };
  }
  return { allowed: true };
}

/** Format an unlimited / numeric quota for display. */
export function formatQuota(value: number, suffix = ''): string {
  if (value === -1) return 'Unlimited';
  return suffix ? `${value} ${suffix}` : String(value);
}
