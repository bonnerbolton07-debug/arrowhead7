import { describe, it, expect } from 'vitest';
import {
  applyWatermarkIfRequired,
  buildWatermarkClip,
  buildWatermarkTrack,
  computeTimelineDuration,
  shouldAddWatermark,
  WATERMARK_TEXT,
} from './overlay';
import type { ShotstackRenderConfig } from '@/types/edit';

function makeBaseConfig(durationSec = 12): ShotstackRenderConfig {
  return {
    timeline: {
      tracks: [
        {
          clips: [
            {
              asset: { type: 'video', src: 'r2://footage.mp4' },
              start: 0,
              length: durationSec,
            },
          ],
        },
      ],
    },
    output: { format: 'mp4', resolution: '1080' },
  };
}

describe('shouldAddWatermark', () => {
  it('returns true for free / null / starter', () => {
    expect(shouldAddWatermark('free')).toBe(true);
    expect(shouldAddWatermark(null)).toBe(true);
    expect(shouldAddWatermark(undefined)).toBe(true);
    expect(shouldAddWatermark('starter')).toBe(true);
  });

  it('returns false for paid tiers', () => {
    expect(shouldAddWatermark('creator')).toBe(false);
    expect(shouldAddWatermark('pro')).toBe(false);
    expect(shouldAddWatermark('studio')).toBe(false);
    expect(shouldAddWatermark('enterprise')).toBe(false);
  });
});

describe('buildWatermarkClip', () => {
  it('uses the supplied logo URL as an image asset', () => {
    const clip = buildWatermarkClip({
      duration: 10,
      logoUrl: 'https://cdn.example.com/logo.png',
    });
    expect(clip.asset.type).toBe('image');
    expect(clip.asset.src).toBe('https://cdn.example.com/logo.png');
    expect(clip.length).toBe(10);
    expect(clip.position).toBe('bottom');
    expect(clip.opacity).toBeGreaterThan(0);
    expect(clip.scale).toBeLessThan(1);
  });

  it('falls back to a title clip with "Made with A7" when no logo URL', () => {
    const clip = buildWatermarkClip({ duration: 5 });
    expect(clip.asset.type).toBe('title');
    expect(clip.asset.text).toBe(WATERMARK_TEXT);
  });
});

describe('buildWatermarkTrack', () => {
  it('wraps a single clip in a track', () => {
    const track = buildWatermarkTrack({ duration: 5, logoUrl: 'x' });
    expect(track.clips).toHaveLength(1);
  });
});

describe('applyWatermarkIfRequired', () => {
  it('appends a watermark track for free tier', () => {
    const before = makeBaseConfig();
    const after = applyWatermarkIfRequired(before, 'free');
    expect(after.timeline.tracks).toHaveLength(2);
    const wmTrack = after.timeline.tracks.at(-1);
    expect(wmTrack?.clips[0].length).toBe(12);
  });

  it('appends a watermark track when tier is null', () => {
    const after = applyWatermarkIfRequired(makeBaseConfig(), null);
    expect(after.timeline.tracks).toHaveLength(2);
  });

  it('appends a watermark track when tier is starter', () => {
    const after = applyWatermarkIfRequired(makeBaseConfig(), 'starter');
    expect(after.timeline.tracks).toHaveLength(2);
  });

  it('leaves config unchanged for pro tier', () => {
    const before = makeBaseConfig();
    const after = applyWatermarkIfRequired(before, 'pro');
    expect(after.timeline.tracks).toHaveLength(1);
    expect(after).toEqual(before);
  });

  it('leaves config unchanged for enterprise / studio', () => {
    const after = applyWatermarkIfRequired(makeBaseConfig(), 'studio');
    expect(after.timeline.tracks).toHaveLength(1);
  });

  it('respects override duration', () => {
    const after = applyWatermarkIfRequired(makeBaseConfig(), 'free', { duration: 3 });
    expect(after.timeline.tracks.at(-1)?.clips[0].length).toBe(3);
  });

  it('does not mutate the input config', () => {
    const before = makeBaseConfig();
    const beforeTracks = before.timeline.tracks.length;
    applyWatermarkIfRequired(before, 'free');
    expect(before.timeline.tracks).toHaveLength(beforeTracks);
  });
});

describe('computeTimelineDuration', () => {
  it('returns the latest clip end across all tracks', () => {
    const timeline = {
      tracks: [
        { clips: [{ asset: { type: 'video' as const }, start: 0, length: 5 }] },
        { clips: [{ asset: { type: 'video' as const }, start: 3, length: 4 }] },
      ],
    };
    expect(computeTimelineDuration(timeline)).toBe(7);
  });

  it('returns zero for empty timeline', () => {
    expect(computeTimelineDuration({ tracks: [] })).toBe(0);
  });
});
