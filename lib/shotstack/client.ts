// =============================================================================
// Arrowhead 7 — Shotstack API Wrapper
// =============================================================================
// Cloud video rendering via the Shotstack Edit API.
// Docs: https://shotstack.io/docs/api/

import type {
  ShotstackRenderConfig,
  ShotstackTimeline,
  ShotstackTrack,
  ShotstackClip,
  ShotstackOutput,
  StyleDNA,
  SupplementalMediaAsset,
  EditDirectionMetadata,
} from '@/types/edit';
import {
  buildRenderConfig,
  type MatcherOptions,
  type SourceAnalysis,
} from '@/lib/style-dna/matcher';
import { applyWatermarkIfRequired } from '@/lib/watermark/overlay';
import type { SubscriptionTier } from '@/types';
import type { WhisperTranscription } from '@/lib/captions/whisper';
import { buildCaptionTrack, type CaptionStyle } from '@/lib/captions/burn-in';

function getShotstackConfig() {
  const apiUrl = process.env.SHOTSTACK_API_URL || 'https://api.shotstack.io/edit/stage';
  const isProduction = apiUrl.includes('/v1');
  const apiKey = isProduction
    ? process.env.SHOTSTACK_PROD_API_KEY
    : process.env.SHOTSTACK_STAGE_API_KEY;
  if (!apiKey) {
    throw new Error(isProduction ? 'SHOTSTACK_PROD_API_KEY is not configured' : 'SHOTSTACK_STAGE_API_KEY is not configured');
  }
  return { apiUrl, apiKey };
}

function getHeaders(): Record<string, string> {
  const { apiKey } = getShotstackConfig();
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };
}

// ─── Render ──────────────────────────────────────────────────────────────────

export async function submitRender(config: ShotstackRenderConfig): Promise<string> {
  const { apiUrl } = getShotstackConfig();
  const response = await fetch(`${apiUrl}/render`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shotstack render failed: ${response.status} — ${error}`);
  }

  const data = await response.json();
  return data.response.id;
}

export function summarizeShotstackConfig(config: ShotstackRenderConfig): {
  tracks: number;
  clips: number;
  duration: number;
  output: ShotstackOutput;
} {
  const clips = config.timeline.tracks.flatMap((track) => track.clips);
  return {
    tracks: config.timeline.tracks.length,
    clips: clips.length,
    duration: Number(
      clips.reduce((max, clip) => Math.max(max, clip.start + clip.length), 0).toFixed(3)
    ),
    output: config.output,
  };
}

export async function getRenderStatus(renderId: string): Promise<{
  status: string;
  progress: number;
  url?: string;
  error?: string;
}> {
  const { apiUrl } = getShotstackConfig();
  const response = await fetch(`${apiUrl}/render/${renderId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Shotstack status check failed: ${response.status}`);
  }

  const data = await response.json();
  const render = data.response;

  return {
    status: render.status,
    progress: render.status === 'done' ? 100 : estimateProgress(render.status),
    url: render.url || undefined,
    error: render.error || undefined,
  };
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function createTemplate(
  _name: string,
  _config: ShotstackRenderConfig
): Promise<string> {
  throw new Error('Not implemented');
}

export async function getTemplate(_templateId: string): Promise<ShotstackRenderConfig> {
  throw new Error('Not implemented');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateProgress(status: string): number {
  switch (status) {
    case 'queued': return 5;
    case 'fetching': return 15;
    case 'rendering': return 50;
    case 'saving': return 85;
    case 'done': return 100;
    default: return 0;
  }
}

// ─── Style DNA -> Shotstack timeline ────────────────────────────────────────

export interface BuildTimelineOptions extends Omit<MatcherOptions, 'sourceVideoUrl'> {
  /** When provided, a caption track is added with the given style. */
  captions?: {
    transcription: WhisperTranscription;
    style: CaptionStyle;
  };
  /** Subscription tier — drives watermark inclusion when set. */
  tier?: SubscriptionTier | string | null;
  /** Extra source assets selected by the creator: b-roll, stills, music, and SFX. */
  sourceMedia?: SupplementalMediaAsset[];
  /** Creator's free-form director note for this render or variation. */
  editPrompt?: string;
}

export interface BuildTimelineInput {
  sourceVideoUrl: string;
  styleDNA: StyleDNA;
  sourceAnalysis: SourceAnalysis;
  options?: BuildTimelineOptions;
}

/**
 * Build a Shotstack render config from Style DNA + analysed source footage.
 *
 * Two call shapes are supported:
 *  1. Object form (production path): pass `{ sourceVideoUrl, styleDNA, sourceAnalysis, options }`.
 *     Delegates to the Style DNA matcher which produces the full cut-rhythm,
 *     pacing, energy-arc, color and audio-sync timeline.
 *  2. Positional form (lightweight / pre-analysis fallback): pass
 *     `(sourceVideoUrl, styleDNA?, options?)`. Returns a minimal-but-valid
 *     config with a single video clip; useful when the user clicks Render
 *     before Style DNA analysis finishes.
 *
 * In both shapes, options may include `captions` (transcription + style) and
 * `tier` — captions are layered as their own track, and when `tier` is
 * provided the watermark is applied via `applyWatermarkIfRequired`.
 */
export function buildTimelineFromStyleDNA(input: BuildTimelineInput): ShotstackRenderConfig;
export function buildTimelineFromStyleDNA(
  sourceVideoUrl: string,
  styleDNA?: StyleDNA | null,
  options?: BuildTimelineOptions
): ShotstackRenderConfig;
export function buildTimelineFromStyleDNA(
  inputOrUrl: BuildTimelineInput | string,
  styleDNAArg?: StyleDNA | null,
  optionsArg?: BuildTimelineOptions
): ShotstackRenderConfig {
  let baseConfig: ShotstackRenderConfig;
  let options: BuildTimelineOptions;

  if (typeof inputOrUrl === 'object') {
    options = inputOrUrl.options ?? {};
    baseConfig = buildRenderConfig(inputOrUrl.styleDNA, inputOrUrl.sourceAnalysis, {
      ...options,
      sourceVideoUrl: inputOrUrl.sourceVideoUrl,
    });
  } else {
    options = optionsArg ?? {};
    const duration = options.targetDuration ?? 10;
    const videoClip: ShotstackClip = {
      asset: { type: 'video', src: inputOrUrl },
      start: 0,
      length: duration,
    };
    const timeline: ShotstackTimeline = {
      tracks: [{ clips: [videoClip] }],
      background: '#000000',
    };
    const output: ShotstackOutput = {
      format: options.outputFormat ?? 'mp4',
      resolution: options.outputResolution ?? '1080',
      fps: options.outputFps ?? 30,
      quality: 'high',
    };
    // styleDNAArg is referenced here so tooling doesn't flag it as unused while
    // the full matcher remains the object-form path.
    void styleDNAArg;
    baseConfig = { timeline, output };
  }

  if (options.captions) {
    const captionTrack = buildCaptionTrack(options.captions.transcription, {
      style: options.captions.style,
    });
    if (captionTrack) {
      const tracks: ShotstackTrack[] = [captionTrack, ...baseConfig.timeline.tracks];
      baseConfig = {
        ...baseConfig,
        timeline: { ...baseConfig.timeline, tracks },
      };
    }
  }

  if (options.sourceMedia && options.sourceMedia.length > 1) {
    baseConfig = addSupplementalMedia(baseConfig, options.sourceMedia, options.targetDuration ?? 30);
  }

  if (options.editPrompt?.trim()) {
    baseConfig = attachEditDirection(baseConfig, options.editPrompt);
  }

  if (options.tier === undefined) return baseConfig;
  return applyWatermarkIfRequired(baseConfig, options.tier);
}

function attachEditDirection(config: ShotstackRenderConfig, prompt: string): ShotstackRenderConfig {
  const metadata: EditDirectionMetadata = {
    prompt: prompt.trim().slice(0, 500),
    generated_at: new Date().toISOString(),
  };
  return {
    ...config,
    merge: [
      ...(config.merge ?? []),
      { find: 'A7_EDIT_DIRECTION', replace: metadata.prompt },
      { find: 'A7_EDIT_DIRECTION_AT', replace: metadata.generated_at },
    ],
  };
}

function addSupplementalMedia(
  config: ShotstackRenderConfig,
  media: SupplementalMediaAsset[],
  targetDuration: number
): ShotstackRenderConfig {
  const supplemental = media.slice(1);
  const visualAssets = supplemental.filter((asset) => asset.type === 'image' || asset.type === 'video');
  const audioAssets = supplemental.filter((asset) => asset.type === 'audio');
  const tracks: ShotstackTrack[] = [...config.timeline.tracks];

  if (visualAssets.length > 0) {
    const slotLength = Math.max(1.5, Math.min(3, targetDuration / Math.max(3, visualAssets.length + 1)));
    const clips: ShotstackClip[] = visualAssets.slice(0, 8).map((asset, index) => {
      const start = Math.min(Math.max(0, targetDuration - slotLength), (index + 1) * (targetDuration / (visualAssets.length + 1)));
      return {
        asset: {
          type: asset.type,
          src: asset.url,
          volume: asset.type === 'video' ? 0 : undefined,
        },
        start: Number(start.toFixed(3)),
        length: Number(slotLength.toFixed(3)),
        effect: asset.type === 'image' ? 'zoomIn' : undefined,
        transition: { in: 'fade', out: 'fade' },
      };
    });
    tracks.unshift({ clips });
  }

  if (audioAssets.length > 0) {
    const clips: ShotstackClip[] = audioAssets.slice(0, 3).map((asset, index) => ({
      asset: {
        type: 'audio',
        src: asset.url,
        volume: index === 0 ? 0.45 : 0.28,
        effect: 'fadeInFadeOut',
      },
      start: index === 0 ? 0 : Math.min(targetDuration - 1, index * Math.max(4, targetDuration / 3)),
      length: targetDuration,
    }));
    tracks.push({ clips });
  }

  return {
    ...config,
    timeline: {
      ...config.timeline,
      tracks,
    },
  };
}
