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
} from './gating';
import { TIER_LIMITS } from '@/types';

describe('normalizeTier', () => {
  it('coerces null and undefined to free', () => {
    expect(normalizeTier(null)).toBe('free');
    expect(normalizeTier(undefined)).toBe('free');
  });

  it('passes through canonical tiers', () => {
    expect(normalizeTier('free')).toBe('free');
    expect(normalizeTier('pro')).toBe('pro');
    expect(normalizeTier('studio')).toBe('studio');
  });

  it('maps external aliases to canonical tiers', () => {
    expect(normalizeTier('starter')).toBe('free');
    expect(normalizeTier('STARTER')).toBe('free');
    expect(normalizeTier('creator')).toBe('pro');
    expect(normalizeTier('enterprise')).toBe('studio');
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
    expect(requiresWatermark('pro')).toBe(false);
    expect(requiresWatermark('studio')).toBe(false);
    expect(requiresWatermark('enterprise')).toBe(false); // alias → studio
  });
});

describe('canUseResolution', () => {
  it('caps free tier at 720 / HD', () => {
    expect(canUseResolution('free', 'sd')).toBe(true);
    expect(canUseResolution('free', 'hd')).toBe(true);
    expect(canUseResolution('free', '1080')).toBe(false);
    expect(canUseResolution('free', '4k')).toBe(false);
  });

  it('allows pro and studio to use 4K', () => {
    expect(canUseResolution('pro', '4k')).toBe(true);
    expect(canUseResolution('studio', '4k')).toBe(true);
  });
});

describe('canUseAutoCaptions', () => {
  it('blocks free, allows paid tiers', () => {
    expect(canUseAutoCaptions('free')).toBe(false);
    expect(canUseAutoCaptions(null)).toBe(false);
    expect(canUseAutoCaptions('pro')).toBe(true);
    expect(canUseAutoCaptions('studio')).toBe(true);
  });
});

describe('canUseDuration', () => {
  it('enforces per-tier max duration in seconds', () => {
    expect(canUseDuration('free', 30)).toBe(true);
    expect(canUseDuration('free', 60)).toBe(true);
    expect(canUseDuration('free', 120)).toBe(false);

    expect(canUseDuration('pro', 600)).toBe(true);
    expect(canUseDuration('pro', 601)).toBe(false);

    expect(canUseDuration('studio', 3600)).toBe(true);
  });
});

describe('canCreateEdit', () => {
  it('blocks free users out of credits', () => {
    const result = canCreateEdit('free', 0, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/used all/i);
  });

  it('blocks at concurrent edit cap', () => {
    const result = canCreateEdit('free', 3, 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/concurrent edit/i);
  });

  it('allows studio to ignore credit and concurrency limits', () => {
    const result = canCreateEdit('studio', 0, 50);
    expect(result.allowed).toBe(true);
  });

  it('returns allowed when credits and capacity available', () => {
    const result = canCreateEdit('pro', 10, 1);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe('TIER_LIMITS shape', () => {
  it('declares all three canonical tiers', () => {
    expect(Object.keys(TIER_LIMITS).sort()).toEqual(['free', 'pro', 'studio']);
  });

  it('has watermark only on free tier', () => {
    expect(TIER_LIMITS.free.watermark).toBe(true);
    expect(TIER_LIMITS.pro.watermark).toBe(false);
    expect(TIER_LIMITS.studio.watermark).toBe(false);
  });

  it('reflects credit progression', () => {
    expect(getTierLimits('free').credits_per_month).toBeLessThan(
      getTierLimits('pro').credits_per_month
    );
  });
});

describe('highestAllowedResolution', () => {
  it('returns hd for free, 4k for pro and studio', () => {
    expect(highestAllowedResolution('free')).toBe('hd');
    expect(highestAllowedResolution('pro')).toBe('4k');
    expect(highestAllowedResolution('studio')).toBe('4k');
  });
});
