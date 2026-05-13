// =============================================================================
// Arrowhead 7 — Shotstack API Wrapper
// =============================================================================
// Cloud video rendering via the Shotstack Edit API.
// Docs: https://shotstack.io/docs/api/

import type { ShotstackRenderConfig, StyleDNA } from '@/types/edit';
import { buildRenderConfig, type MatcherOptions, type SourceAnalysis } from '@/lib/style-dna/matcher';

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

export interface BuildTimelineInput {
  sourceVideoUrl: string;
  styleDNA: StyleDNA;
  sourceAnalysis: SourceAnalysis;
  options?: Omit<MatcherOptions, 'sourceVideoUrl'>;
}

/**
 * Build a complete Shotstack render config from a Style DNA profile and the
 * pre-analysed source footage. This is the bridge between the Style DNA engine
 * and the renderer — every DNA dimension (cut rhythm, pacing, energy arc, color
 * profile, transitions, narrative structure, audio sync) is mapped into clip
 * timing, filters, transitions, and tracks.
 *
 * Use this in the render API route. For a one-shot path that performs the
 * source analysis itself, see `applyStyleDNAFromReference` in the matcher.
 */
export function buildTimelineFromStyleDNA(input: BuildTimelineInput): ShotstackRenderConfig {
  const { sourceVideoUrl, styleDNA, sourceAnalysis, options } = input;
  return buildRenderConfig(styleDNA, sourceAnalysis, {
    ...(options ?? {}),
    sourceVideoUrl,
  });
}
