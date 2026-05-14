// =============================================================================
// Arrowhead 7 — Color & frame analysis
// =============================================================================
// Samples frames at scene boundaries, decodes them at 64x64 RGB24 (via FFmpeg
// piped to stdout), and derives:
//   - Average temperature/saturation/contrast/brightness across the whole video
//   - Dominant palette per scene (k=5 via a fast quantised k-means on 16x16x16)
//   - Per-frame brightness for energy correlation
//
// The output is mapped onto the StyleDNA ColorProfile and used by the matcher
// to drive Shotstack filters.

import { runFfmpeg } from './ffmpeg-runner';
import type { ColorProfile } from '@/types/edit';

const SAMPLE_SIZE = 64; // 64x64 frame is plenty for color summary

interface FrameStats {
  /** Average RGB across the frame, each 0..255 */
  avg: { r: number; g: number; b: number };
  /** Average HSL saturation (0..1) and lightness (0..1) */
  saturation: number;
  brightness: number;
  /** Std-dev of luminance (used as contrast proxy) */
  contrast: number;
  /** Top dominant colors as hex strings */
  dominant_colors: string[];
  /** Mean luminance for energy correlation */
  luminance: number;
}

async function extractRgbFrame(filePath: string, atSeconds: number): Promise<Buffer | null> {
  try {
    const { stdout } = await runFfmpeg(
      [
        '-hide_banner',
        '-nostats',
        '-loglevel',
        'error',
        '-ss',
        atSeconds.toFixed(3),
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${SAMPLE_SIZE}:${SAMPLE_SIZE},format=rgb24`,
        '-f',
        'rawvideo',
        '-',
      ],
      // 8s per frame is generous — fast-seek + 64x64 decode is sub-second on
      // any sane input. The previous 20s was a holdover that could stack to
      // 360s wall-clock across 18 frames and blow the route budget.
      { timeoutMs: 8_000 }
    );
    if (stdout.length < SAMPLE_SIZE * SAMPLE_SIZE * 3) return null;
    return stdout.slice(0, SAMPLE_SIZE * SAMPLE_SIZE * 3);
  } catch {
    return null;
  }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let s = 0;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => v.toString(16).padStart(2, '0');
  return `#${c(Math.round(r))}${c(Math.round(g))}${c(Math.round(b))}`;
}

/**
 * Dominant-color extraction via quantised histogram. We bucket each pixel into
 * a 4-bit-per-channel cube (4096 buckets) and report the top 5 bucket centres.
 * Faster and more deterministic than full k-means and good enough for palette
 * matching in a style fingerprint.
 */
function dominantColors(buf: Buffer, k = 5): string[] {
  const counts = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    const bucket = (Math.floor(r / 16) << 8) | (Math.floor(g / 16) << 4) | Math.floor(b / 16);
    const entry = counts.get(bucket);
    if (entry) {
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
    } else {
      counts.set(bucket, { count: 1, r, g, b });
    }
  }
  const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
  return sorted.slice(0, k).map((e) => toHex(e.r / e.count, e.g / e.count, e.b / e.count));
}

function analyseFrameBytes(buf: Buffer): FrameStats {
  let r = 0;
  let g = 0;
  let b = 0;
  let sSum = 0;
  let lSum = 0;
  let lumSqSum = 0;
  let lumSum = 0;
  const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;
  for (let i = 0; i < pixelCount; i++) {
    const pr = buf[i * 3];
    const pg = buf[i * 3 + 1];
    const pb = buf[i * 3 + 2];
    r += pr;
    g += pg;
    b += pb;
    const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
    lumSum += lum;
    lumSqSum += lum * lum;
    const hsl = rgbToHsl(pr, pg, pb);
    sSum += hsl.s;
    lSum += hsl.l;
  }
  const meanLum = lumSum / pixelCount;
  const variance = lumSqSum / pixelCount - meanLum * meanLum;
  return {
    avg: { r: r / pixelCount, g: g / pixelCount, b: b / pixelCount },
    saturation: sSum / pixelCount,
    brightness: lSum / pixelCount,
    contrast: Math.sqrt(Math.max(0, variance)) / 128, // 0..1
    luminance: meanLum / 255,
    dominant_colors: dominantColors(buf),
  };
}

export interface FrameAnalysis {
  timestamp: number;
  stats: FrameStats;
}

export async function sampleFrames(
  filePath: string,
  timestamps: number[],
  maxSamples = 18,
  /** Hard wall-clock budget for the entire sampling pass. We stop early if
   *  we blow past it, even with frames remaining — a partial color profile is
   *  better than blowing the route budget and falling back to heuristic. */
  budgetMs = 25_000
): Promise<FrameAnalysis[]> {
  if (timestamps.length === 0) return [];
  const stride = Math.max(1, Math.floor(timestamps.length / maxSamples));
  const targets: number[] = [];
  for (let i = 0; i < timestamps.length; i += stride) {
    targets.push(timestamps[i]);
    if (targets.length >= maxSamples) break;
  }
  const start = Date.now();
  const out: FrameAnalysis[] = [];
  for (const t of targets) {
    if (Date.now() - start > budgetMs) break;
    const buf = await extractRgbFrame(filePath, Math.max(0, t + 0.1));
    if (!buf) continue;
    out.push({ timestamp: t, stats: analyseFrameBytes(buf) });
  }
  return out;
}

/**
 * Aggregate per-frame stats into a ColorProfile. Mapping:
 *   temperature: -100..100 from (avgR - avgB) / 255 * 100
 *   saturation:  0..200, 100 = neutral; uses HSL saturation mean
 *   contrast:    0..200, 100 = neutral; from luminance std-dev
 *   brightness:  0..200, 100 = neutral; from HSL lightness mean
 */
export function summariseColorProfile(frames: FrameAnalysis[]): ColorProfile {
  if (frames.length === 0) {
    return { temperature: 0, saturation: 100, contrast: 100, brightness: 100 };
  }
  let rMean = 0;
  let bMean = 0;
  let sat = 0;
  let bright = 0;
  let contrast = 0;
  for (const f of frames) {
    rMean += f.stats.avg.r;
    bMean += f.stats.avg.b;
    sat += f.stats.saturation;
    bright += f.stats.brightness;
    contrast += f.stats.contrast;
  }
  const n = frames.length;
  rMean /= n;
  bMean /= n;
  sat /= n;
  bright /= n;
  contrast /= n;

  return {
    temperature: Math.round(((rMean - bMean) / 255) * 100),
    saturation: Math.round(Math.max(0, Math.min(200, sat * 200))),
    contrast: Math.round(Math.max(0, Math.min(200, contrast * 200))),
    brightness: Math.round(Math.max(0, Math.min(200, bright * 200))),
  };
}

/**
 * Build an "energy" series from per-frame brightness deltas. Combined with the
 * audio energy curve, this lets the analyser tell whether a video uses bright
 * peaks for emphasis (common in dance / fast-cut content).
 */
export function frameEnergySeries(frames: FrameAnalysis[]): number[] {
  if (frames.length < 2) return frames.map((f) => f.stats.luminance);
  const series: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const delta = Math.abs(frames[i].stats.luminance - frames[i - 1].stats.luminance);
    series.push(Math.min(1, delta * 3));
  }
  return series;
}
