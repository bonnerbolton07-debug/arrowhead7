// =============================================================================
// Arrowhead 7 — Shotstack API Wrapper
// =============================================================================
// Cloud video rendering via Shotstack Edit API
// Docs: https://shotstack.io/docs/api/

import type {
  ShotstackRenderConfig,
  ShotstackTimeline,
  ShotstackTrack,
  ShotstackClip,
  ShotstackOutput,
  StyleDNA,
} from '@/types/edit';
import { applyWatermarkIfRequired } from '@/lib/watermark/overlay';
import type { SubscriptionTier } from '@/lib/stripe/gating';
import type { WhisperTranscription } from '@/lib/captions/whisper';
import { buildCaptionTrack, type CaptionStyle } from '@/lib/captions/burn-in';

const SHOTSTACK_API_URL = process.env.SHOTSTACK_API_URL || 'https://api.shotstack.io/edit/stage';
const isProduction = SHOTSTACK_API_URL.includes('/v1');
const SHOTSTACK_API_KEY = isProduction
  ? process.env.SHOTSTACK_PROD_API_KEY!
  : process.env.SHOTSTACK_STAGE_API_KEY!;

function getHeaders(): Record<string, string> {
  if (!SHOTSTACK_API_KEY) {
    throw new Error('SHOTSTACK_API_KEY is not configured');
  }
  return {
    'Content-Type': 'application/json',
    'x-api-key': SHOTSTACK_API_KEY,
  };
}

// ─── Render ──────────────────────────────────────────────────────────────────

/**
 * Submit a render job to Shotstack.
 * Returns the Shotstack render ID for polling.
 */
export async function submitRender(config: ShotstackRenderConfig): Promise<string> {
  const response = await fetch(`${SHOTSTACK_API_URL}/render`, {
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

/**
 * Poll render status from Shotstack.
 */
export async function getRenderStatus(renderId: string): Promise<{
  status: string;
  progress: number;
  url?: string;
  error?: string;
}> {
  const response = await fetch(`${SHOTSTACK_API_URL}/render/${renderId}`, {
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

/**
 * TODO: Create and manage Shotstack templates for common edit styles.
 * Templates allow pre-built editing patterns that can be customized.
 */
export async function createTemplate(
  _name: string,
  _config: ShotstackRenderConfig
): Promise<string> {
  // TODO: POST to /templates
  throw new Error('Not implemented');
}

export async function getTemplate(_templateId: string): Promise<ShotstackRenderConfig> {
  // TODO: GET /templates/:id
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

export interface BuildTimelineOptions {
  /** Override output duration in seconds. */
  targetDuration?: number;
  outputFormat?: ShotstackOutput['format'];
  outputResolution?: ShotstackOutput['resolution'];
  outputFps?: number;
  /** When provided, a caption track is added with the given style. */
  captions?: {
    transcription: WhisperTranscription;
    style: CaptionStyle;
  };
  /** Subscription tier — drives watermark inclusion. */
  tier?: SubscriptionTier | string | null;
}

/**
 * Build a Shotstack timeline from Style DNA parameters.
 *
 * This is the entry point used by the render route. The full editing
 * intelligence lives in `@/lib/style-dna/matcher`; this function produces a
 * minimal-but-valid Shotstack config when a Style DNA is not yet available
 * (e.g. the user clicked Render before analysis finished) and then layers in
 * captions and the free-tier watermark.
 */
export function buildTimelineFromStyleDNA(
  sourceVideoUrl: string,
  styleDNA?: StyleDNA | null,
  options: BuildTimelineOptions = {}
): ShotstackRenderConfig {
  const duration = options.targetDuration ?? 10;

  const videoClip: ShotstackClip = {
    asset: {
      type: 'video',
      src: sourceVideoUrl,
    },
    start: 0,
    length: duration,
  };

  const tracks: ShotstackTrack[] = [{ clips: [videoClip] }];

  if (options.captions) {
    const captionTrack = buildCaptionTrack(
      options.captions.transcription,
      { style: options.captions.style }
    );
    if (captionTrack) tracks.unshift(captionTrack);
  }

  const timeline: ShotstackTimeline = { tracks, background: '#000000' };

  const output: ShotstackOutput = {
    format: options.outputFormat ?? 'mp4',
    resolution: options.outputResolution ?? '1080',
    fps: options.outputFps ?? 30,
    quality: 'high',
  };

  // styleDNA is reserved for future intelligence — referenced here so tooling
  // doesn't flag the parameter as unused while the full matcher is wired up.
  void styleDNA;

  const baseConfig: ShotstackRenderConfig = { timeline, output };
  // Watermark is opt-in at this layer; callers pass the tier when they want
  // gating applied. The render route always passes the real tier from the
  // profile so production renders are stamped correctly.
  if (options.tier === undefined) return baseConfig;
  return applyWatermarkIfRequired(baseConfig, options.tier);
}
