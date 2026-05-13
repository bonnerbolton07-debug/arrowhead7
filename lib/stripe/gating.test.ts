import { describe, it, expect } from 'vitest';
import {
  canCreateEdit,
  canUseAutoCaptions,
  canUseDuration,
  canUseResolution,
  getTierLimits,
  highestAllowedResolution,
  normalizeTier,
  requiresWatermark,
  TIER_LIMITS,
} from './gating';

describe('normalizeTier', () => {
  it('coerces null and undefined to free', () => {
    expect(normalizeTier(null)).toBe('free');
    expect(normalizeTier(undefined)).toBe('free');
  });

  it('passes through canonical tiers', () => {
    expect(normalizeTier('free')).toBe('free');
    expect(normalizeTier('creator')).toBe('creator');
    expect(normalizeTier('pro')).toBe('pro');
    expect(normalizeTier('enterprise')).toBe('enterprise');
  });

  it('maps starter alias to free and studio alias to enterprise', () => {
    expect(normalizeTier('starter')).toBe('free');
    expect(normalizeTier('STARTER')).toBe('free');
    expect(normalizeTier('studio')).toBe('enterprise');
  });

  it('falls back to free for unknown tiers', () => {
    expect(normalizeTier('platinum-unicorn')).toBe('free');
  });
});

describe('requiresWatermark', () => {
  it('stamps watermark for null / starter / free', () => {
    expect(requiresWatermark(null)).toBe(true);
    expect(requiresWatermark(undefined)).toBe(true);
    expect(requiresWatermark('starter')).toBe(true);
    expect(requiresWatermark('free')).toBe(true);
  });

  it('omits watermark for paid tiers', () => {
    expect(requiresWatermark('creator')).toBe(false);
    expect(requiresWatermark('pro')).toBe(false);
    expect(requiresWatermark('enterprise')).toBe(false);
    expect(requiresWatermark('studio')).toBe(false);
  });
});

describe('canUseResolution', () => {
  it('caps free tier at HD', () => {
    expect(canUseResolution('free', 'sd')).toBe(true);
    expect(canUseResolution('free', 'hd')).toBe(true);
    expect(canUseResolution('free', '1080')).toBe(false);
    expect(canUseResolution('free', '4k')).toBe(false);
  });

  it('caps creator tier at 1080', () => {
    expect(canUseResolution('creator', '1080')).toBe(true);
    expect(canUseResolution('creator', '4k')).toBe(false);
  });

  it('allows pro and enterprise to use 4K', () => {
    expect(canUseResolution('pro', '4k')).toBe(true);
    expect(canUseResolution('enterprise', '4k')).toBe(true);
  });
});

describe('canUseAutoCaptions', () => {
  it('blocks free, allows paid tiers', () => {
    expect(canUseAutoCaptions('free')).toBe(false);
    expect(canUseAutoCaptions(null)).toBe(false);
    expect(canUseAutoCaptions('creator')).toBe(true);
    expect(canUseAutoCaptions('pro')).toBe(true);
    expect(canUseAutoCaptions('enterprise')).toBe(true);
  });
});

describe('canUseDuration', () => {
  it('enforces per-tier max duration in seconds', () => {
    expect(canUseDuration('free', 30)).toBe(true);
    expect(canUseDuration('free', 60)).toBe(true);
    expect(canUseDuration('free', 120)).toBe(false);

    expect(canUseDuration('creator', 300)).toBe(true);
    expect(canUseDuration('creator', 301)).toBe(false);

    expect(canUseDuration('enterprise', 3600)).toBe(true);
  });
});

describe('canCreateEdit', () => {
  it('blocks free users out of credits', () => {
    const result = canCreateEdit({
      tier: 'free',
      creditsRemaining: 0,
      activeEdits: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('insufficient_credits');
  });

  it('blocks at concurrent edit cap', () => {
    const result = canCreateEdit({
      tier: 'free',
      creditsRemaining: 3,
      activeEdits: 1,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('concurrent_limit');
  });

  it('allows enterprise to ignore credit limits', () => {
    const result = canCreateEdit({
      tier: 'enterprise',
      creditsRemaining: 0,
      activeEdits: 50,
    });
    expect(result.allowed).toBe(true);
  });

  it('returns allowed when credits and capacity available', () => {
    const result = canCreateEdit({
      tier: 'creator',
      creditsRemaining: 10,
      activeEdits: 1,
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe('TIER_LIMITS shape', () => {
  it('declares all four tiers', () => {
    expect(Object.keys(TIER_LIMITS).sort()).toEqual([
      'creator',
      'enterprise',
      'free',
      'pro',
    ]);
  });

  it('has watermark only on free tier', () => {
    expect(TIER_LIMITS.free.watermark).toBe(true);
    expect(TIER_LIMITS.creator.watermark).toBe(false);
    expect(TIER_LIMITS.pro.watermark).toBe(false);
    expect(TIER_LIMITS.enterprise.watermark).toBe(false);
  });

  it('reflects credit progression', () => {
    expect(getTierLimits('free').creditsPerMonth).toBeLessThan(
      getTierLimits('creator').creditsPerMonth
    );
    expect(getTierLimits('creator').creditsPerMonth).toBeLessThan(
      getTierLimits('pro').creditsPerMonth
    );
  });
});

describe('highestAllowedResolution', () => {
  it('returns hd for free, 4k for pro', () => {
    expect(highestAllowedResolution('free')).toBe('hd');
    expect(highestAllowedResolution('pro')).toBe('4k');
  });
});
