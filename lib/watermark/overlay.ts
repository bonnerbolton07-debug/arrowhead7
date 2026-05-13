// =============================================================================
// Arrowhead 7 — "Made with A7" Watermark Overlay
// =============================================================================
// Adds the A7 mark to free-tier renders. Drives organic growth — every
// shared video is a "made with" credit pointing back to the product.

import type {
  ShotstackClip,
  ShotstackRenderConfig,
  ShotstackTimeline,
  ShotstackTrack,
} from '@/types/edit';
import { requiresWatermark, type SubscriptionTier } from '@/lib/stripe/gating';

export const WATERMARK_TEXT = 'Made with A7';

/**
 * Default A7 logo URL. Override via NEXT_PUBLIC_A7_WATERMARK_URL or by passing
 * `logoUrl` to `buildWatermarkClip`. When undefined, falls back to a title clip
 * so the watermark still renders even with no asset host.
 */
export function defaultWatermarkLogoUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_A7_WATERMARK_URL;
}

export interface WatermarkOptions {
  /** Override the duration (seconds) the watermark stays on screen. */
  duration: number;
  /** Override the logo URL. */
  logoUrl?: string;
  /** Where to anchor the mark. Defaults to bottom-right. */
  position?: 'top' | 'center' | 'bottom';
  /** Visual opacity 0-1. Defaults to 0.7. */
  opacity?: number;
  /** Scale 0-1. Defaults to 0.12 (small, unobtrusive). */
  scale?: number;
}

/**
 * Build a single Shotstack clip that displays the A7 watermark for the full
 * length of the render. Uses an image asset if a logo URL is available,
 * otherwise falls back to a styled title.
 */
export function buildWatermarkClip(options: WatermarkOptions): ShotstackClip {
  const logoUrl = options.logoUrl ?? defaultWatermarkLogoUrl();
  const opacity = options.opacity ?? 0.7;
  const scale = options.scale ?? 0.12;
  const position = options.position ?? 'bottom';

  if (logoUrl) {
    return {
      asset: {
        type: 'image',
        src: logoUrl,
      },
      start: 0,
      length: options.duration,
      position,
      offset: { x: 0.38, y: position === 'bottom' ? -0.38 : 0.38 },
      scale,
      opacity,
    };
  }

  return {
    asset: {
      type: 'title',
      text: WATERMARK_TEXT,
      style:
        'font-family: Inter; font-weight: 600; font-size: 22px; color: #F5F0E8; ' +
        'background: rgba(16,16,14,0.55); padding: 6px 10px; border-radius: 4px; ' +
        'text-shadow: 0 1px 2px rgba(0,0,0,0.6);',
    },
    start: 0,
    length: options.duration,
    position,
    offset: { x: 0.32, y: position === 'bottom' ? -0.42 : 0.42 },
    opacity,
  };
}

export function buildWatermarkTrack(options: WatermarkOptions): ShotstackTrack {
  return { clips: [buildWatermarkClip(options)] };
}

/** True when this tier renders a watermark. Free / null / starter all qualify. */
export function shouldAddWatermark(
  tier: SubscriptionTier | string | null | undefined
): boolean {
  return requiresWatermark(tier);
}

/**
 * Apply the watermark to a Shotstack render config, mutating its timeline
 * track list when required. Returns the config unchanged when the tier does
 * not require a watermark.
 */
export function applyWatermarkIfRequired(
  config: ShotstackRenderConfig,
  tier: SubscriptionTier | string | null | undefined,
  overrides: Partial<WatermarkOptions> = {}
): ShotstackRenderConfig {
  if (!shouldAddWatermark(tier)) return config;

  const duration = overrides.duration ?? computeTimelineDuration(config.timeline);
  if (duration <= 0) return config;

  const track = buildWatermarkTrack({
    duration,
    logoUrl: overrides.logoUrl,
    position: overrides.position,
    opacity: overrides.opacity,
    scale: overrides.scale,
  });

  return {
    ...config,
    timeline: {
      ...config.timeline,
      tracks: [...config.timeline.tracks, track],
    },
  };
}

export function computeTimelineDuration(timeline: ShotstackTimeline): number {
  let max = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.start + clip.length;
      if (end > max) max = end;
    }
  }
  return max;
}
