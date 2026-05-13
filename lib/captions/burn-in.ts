// =============================================================================
// Arrowhead 7 — Caption Burn-In (Shotstack Timeline Integration)
// =============================================================================
// Produce a Shotstack track of caption title clips, styled to match popular
// social formats (TikTok bold, YouTube subtitle bar, karaoke word highlight).

import type { ShotstackClip, ShotstackTrack } from '@/types/edit';
import type { CaptionLine } from './srt';
import type { WhisperTranscription } from './whisper';
import {
  buildLinesFromTranscription,
  buildWordLines,
  type BuildLineOptions,
} from './srt';

export type CaptionStyle = 'tiktok-bold' | 'youtube-bar' | 'karaoke';

export interface BurnInOptions extends BuildLineOptions {
  style: CaptionStyle;
  /** Override the colour palette. Defaults to A7 electric cyan. */
  highlightColor?: string;
  textColor?: string;
  fontFamily?: string;
}

const A7_CYAN = '#2DD4BF';
const A7_COPPER = '#B87333';
const A7_CREAM = '#F5F0E8';

const STYLE_DEFAULTS: Record<CaptionStyle, {
  textColor: string;
  highlightColor: string;
  background: string;
  position: 'top' | 'center' | 'bottom';
  fontFamily: string;
  fontSize: number;
}> = {
  'tiktok-bold': {
    textColor: A7_CREAM,
    highlightColor: A7_CYAN,
    background: 'rgba(0,0,0,0.55)',
    position: 'center',
    fontFamily: 'Montserrat ExtraBold',
    fontSize: 64,
  },
  'youtube-bar': {
    textColor: A7_CREAM,
    highlightColor: A7_CYAN,
    background: 'rgba(0,0,0,0.78)',
    position: 'bottom',
    fontFamily: 'Inter',
    fontSize: 38,
  },
  karaoke: {
    textColor: A7_CREAM,
    highlightColor: A7_COPPER,
    background: 'transparent',
    position: 'center',
    fontFamily: 'Montserrat ExtraBold',
    fontSize: 72,
  },
};

/**
 * Build a Shotstack track of caption clips from a Whisper transcription.
 * Returns `undefined` when there are no caption lines (e.g. silent video).
 */
export function buildCaptionTrack(
  transcription: WhisperTranscription,
  options: BurnInOptions
): ShotstackTrack | undefined {
  const defaults = STYLE_DEFAULTS[options.style];
  const lineOptions: BuildLineOptions = {
    maxCharsPerLine: options.maxCharsPerLine,
    maxLineDurationSec: options.maxLineDurationSec,
  };

  const lines: CaptionLine[] =
    options.style === 'karaoke'
      ? buildWordLines(transcription.words)
      : buildLinesFromTranscription(transcription, lineOptions);

  if (lines.length === 0) return undefined;

  const textColor = options.textColor ?? defaults.textColor;
  const fontFamily = options.fontFamily ?? defaults.fontFamily;
  const highlightColor = options.highlightColor ?? defaults.highlightColor;

  const clips: ShotstackClip[] = lines.map((line) => ({
    asset: {
      type: 'title',
      text: line.text,
      style: buildAssetStyle({
        style: options.style,
        textColor,
        fontFamily,
        highlightColor,
        background: defaults.background,
        fontSize: defaults.fontSize,
      }),
    },
    start: line.start,
    length: Math.max(0.2, line.end - line.start),
    position: defaults.position,
    transition: options.style === 'karaoke' ? undefined : { in: 'fade', out: 'fade' },
  }));

  return { clips };
}

interface AssetStyleInput {
  style: CaptionStyle;
  textColor: string;
  fontFamily: string;
  highlightColor: string;
  background: string;
  fontSize: number;
}

/**
 * Encode caption styling as a Shotstack-compatible CSS-ish string.
 * Exposed for unit testing.
 */
export function buildAssetStyle(input: AssetStyleInput): string {
  const weight = input.style === 'youtube-bar' ? 600 : 800;
  const stroke = input.style === 'youtube-bar' ? 'none' : '2px rgba(0,0,0,0.85)';
  const textAlign = 'center';
  const background = input.background === 'transparent' ? 'none' : input.background;
  const accent = input.highlightColor;

  return [
    `font-family: ${input.fontFamily}`,
    `font-weight: ${weight}`,
    `font-size: ${input.fontSize}px`,
    `color: ${input.textColor}`,
    `text-align: ${textAlign}`,
    `background: ${background}`,
    `padding: 8px 16px`,
    `border-radius: 6px`,
    `text-shadow: 0 2px 4px rgba(0,0,0,0.6)`,
    `-webkit-text-stroke: ${stroke}`,
    `--a7-highlight: ${accent}`,
  ].join('; ');
}

export const __test = {
  STYLE_DEFAULTS,
};
