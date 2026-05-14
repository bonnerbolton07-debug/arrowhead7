// =============================================================================
// Arrowhead 7 — Video metadata + scene detection
// =============================================================================
// Wraps ffprobe and the ffmpeg scene-detection filter to produce:
//   - VideoMetadata: width, height, duration, fps, codec, has_audio
//   - SceneCutList: timestamps of every detected scene boundary
//
// We intentionally avoid AI vision here — those calls live in the cut-type
// classifier and are gated on a separate (paid) provider. This module only
// needs FFmpeg.

import { runFfprobe, runFfmpeg } from './ffmpeg-runner';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate?: number;
  has_audio: boolean;
}

interface FfprobeStream {
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeFormat {
  duration?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

function parseFrameRate(value: string | undefined): number {
  if (!value) return 30;
  if (value.includes('/')) {
    const [num, den] = value.split('/').map(Number);
    if (den === 0) return 30;
    return num / den;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function extractMetadata(filePath: string): Promise<VideoMetadata> {
  const { stdout } = await runFfprobe([
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const parsed = JSON.parse(stdout.toString('utf8')) as FfprobeOutput;
  const streams = parsed.streams || [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');

  if (!video) throw new Error('No video stream found in source');

  const formatDuration = parsed.format?.duration ? Number(parsed.format.duration) : NaN;
  const streamDuration = video.duration ? Number(video.duration) : NaN;
  const duration = Number.isFinite(formatDuration)
    ? formatDuration
    : Number.isFinite(streamDuration)
      ? streamDuration
      : 0;

  const bitrate = parsed.format?.bit_rate
    ? Number(parsed.format.bit_rate)
    : video.bit_rate
      ? Number(video.bit_rate)
      : undefined;

  return {
    duration,
    width: video.width || 0,
    height: video.height || 0,
    fps: parseFrameRate(video.avg_frame_rate || video.r_frame_rate),
    codec: video.codec_name || 'unknown',
    bitrate: Number.isFinite(bitrate) ? bitrate : undefined,
    has_audio: Boolean(audio),
  };
}

export interface SceneCutList {
  /** Scene change timestamps, in seconds, including a leading 0 and trailing duration */
  cuts: number[];
  /** Scene-change score reported by ffmpeg, one per cut (excluding leading 0) */
  scores: number[];
}

/**
 * Run FFmpeg's `select='gt(scene,threshold)'` filter and parse the
 * `showinfo` output for scene boundary timestamps.
 *
 * The 0.3 threshold is the conventional default — it flags both hard cuts and
 * most major dissolves while ignoring within-shot motion.
 */
export async function detectScenes(
  filePath: string,
  totalDuration: number,
  threshold = 0.3
): Promise<SceneCutList> {
  // Bound the input to `totalDuration` (already clamped to maxAnalyzeSeconds by
  // the caller) — without -t, FFmpeg will scan the FULL video even when the
  // analyser only cares about the first N seconds. On a 10-minute reference
  // with a 90s analysis window this was a 6-7x slowdown.
  const args = ['-hide_banner', '-nostats'];
  if (totalDuration > 0) {
    args.push('-t', totalDuration.toFixed(3));
  }
  args.push(
    '-i', filePath,
    '-filter:v', `select='gt(scene,${threshold})',showinfo`,
    '-an',
    '-f', 'null',
    '-'
  );
  const { stderr } = await runFfmpeg(args, { timeoutMs: 60_000 });

  const cuts: number[] = [];
  const scores: number[] = [];
  // showinfo writes lines like:
  // [Parsed_showinfo_1 @ 0x...] n:0 pts:... pts_time:1.234 ... scene_score:0.42
  const ptsRe = /pts_time:([0-9.]+)/g;
  const scoreRe = /scene_score:([0-9.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = ptsRe.exec(stderr)) !== null) {
    const t = Number(m[1]);
    if (Number.isFinite(t)) cuts.push(t);
  }
  while ((m = scoreRe.exec(stderr)) !== null) {
    const s = Number(m[1]);
    if (Number.isFinite(s)) scores.push(s);
  }

  // Normalise: ensure timeline anchors (0 and end) are present so cut-duration
  // arithmetic in the analyser produces sensible bookends.
  const dedup = Array.from(new Set(cuts.map((c) => Math.round(c * 1000) / 1000)));
  const sorted = dedup.sort((a, b) => a - b);
  if (sorted.length === 0 || sorted[0] > 0.05) sorted.unshift(0);
  if (totalDuration > 0 && sorted[sorted.length - 1] < totalDuration - 0.05) {
    sorted.push(totalDuration);
  }

  return { cuts: sorted, scores };
}
