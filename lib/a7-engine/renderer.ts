// =============================================================================
// Arrowhead 7 — Native render engine
// =============================================================================
// Founder-test render path that executes the A7 cut plan directly with FFmpeg
// and saves the finished export into the user's vault. Shotstack remains
// available as fallback while this engine grows toward reference-locked editing.

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { uploadToR2, generateVaultKey, getPresignedDownloadUrl } from '@/lib/cloudflare/r2';
import { registerVaultFile } from '@/lib/vault';
import { resolveSource } from '@/lib/style-dna/source';
import { runFfmpeg, unlinkQuiet } from '@/lib/style-dna/ffmpeg-runner';
import type { ShotstackClip, ShotstackOutput, ShotstackRenderConfig } from '@/types/edit';

export const A7_ENGINE_RENDER_ID_PREFIX = 'a7_engine:';

const DEFAULT_MAX_CLIPS = 120;
const DEFAULT_MAX_DURATION_SECONDS = 180;
const SEGMENT_TIMEOUT_MS = 120_000;
const CONCAT_TIMEOUT_MS = 180_000;

type ResolvedMedia = Awaited<ReturnType<typeof resolveSource>>;

export interface A7EngineReport {
  engine: 'a7_native_ffmpeg';
  providerFallbackEligible: boolean;
  clipsRendered: number;
  uniqueSources: number;
  durationSeconds: number;
  output: {
    width: number;
    height: number;
    fps: number;
    format: 'mp4';
  };
  limits: {
    maxClips: number;
    maxDurationSeconds: number;
    truncated: boolean;
  };
  capabilities: {
    cuts: 'native';
    sourceSelection: 'render-plan';
    color: 'clip-filter-intent';
    transitions: 'hard-cuts-v1';
    soundtrack: 'attached-if-present';
    vfx: 'basic-scale-crop-filter';
  };
  warnings: string[];
}

export interface A7EngineRenderResult {
  renderId: string;
  outputKey: string;
  vaultFileId: string | null;
  playbackUrl: string;
  report: A7EngineReport;
}

interface PlannedClip {
  clip: ShotstackClip;
  source: string;
  timelineStart: number;
  trim: number;
  length: number;
  filter?: string;
}

interface OutputGeometry {
  width: number;
  height: number;
  fps: number;
}

function numericEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function outputGeometry(output: ShotstackOutput): OutputGeometry {
  const fps = Math.max(1, Math.min(60, Math.round(output.fps ?? 30)));
  if (output.size?.width && output.size?.height) {
    return {
      width: Math.round(output.size.width),
      height: Math.round(output.size.height),
      fps,
    };
  }
  switch (output.resolution) {
    case '4k':
      return { width: 3840, height: 2160, fps };
    case 'hd':
      return { width: 1280, height: 720, fps };
    case 'sd':
      return { width: 854, height: 480, fps };
    case '1080':
    default:
      return { width: 1080, height: 1920, fps };
  }
}

export function planVideoClips(config: ShotstackRenderConfig): PlannedClip[] {
  const clips: PlannedClip[] = [];
  for (const track of config.timeline.tracks) {
    for (const clip of track.clips ?? []) {
      if (clip.asset.type !== 'video' || !clip.asset.src || clip.length <= 0) continue;
      clips.push({
        clip,
        source: clip.asset.src,
        timelineStart: Math.max(0, clip.start || 0),
        trim: Math.max(0, Number(clip.asset.trim ?? 0)),
        length: Math.max(0.2, Number(clip.length)),
        filter: clip.filter,
      });
    }
  }
  return clips.sort((a, b) => a.timelineStart - b.timelineStart);
}

export function soundtrackSource(config: ShotstackRenderConfig): string | null {
  if (config.timeline.soundtrack?.src) return config.timeline.soundtrack.src;
  for (const track of config.timeline.tracks) {
    for (const clip of track.clips ?? []) {
      if (clip.asset.type === 'audio' && clip.asset.src) return clip.asset.src;
    }
  }
  return null;
}

export function videoFilter(geometry: OutputGeometry, clipFilter?: string): string {
  const filters = [
    `scale=${geometry.width}:${geometry.height}:force_original_aspect_ratio=increase`,
    `crop=${geometry.width}:${geometry.height}`,
    'setsar=1',
    `fps=${geometry.fps}`,
  ];

  switch ((clipFilter ?? '').toLowerCase()) {
    case 'contrast':
      filters.push('eq=contrast=1.12:saturation=1.04');
      break;
    case 'boost':
    case 'vibrant':
      filters.push('eq=saturation=1.18:contrast=1.05');
      break;
    case 'darken':
      filters.push('eq=brightness=-0.05:contrast=1.05');
      break;
    case 'lighten':
      filters.push('eq=brightness=0.05');
      break;
    case 'greyscale':
    case 'grayscale':
      filters.push('format=gray');
      break;
  }

  return filters.join(',');
}

function writeConcatPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''");
}

async function resolveWithCache(
  source: string,
  cache: Map<string, Promise<ResolvedMedia>>
): Promise<ResolvedMedia> {
  const cached = cache.get(source);
  if (cached) return cached;
  const pending = resolveSource(source);
  cache.set(source, pending);
  return pending;
}

async function cleanupResolved(cache: Map<string, Promise<ResolvedMedia>>) {
  const resolved = await Promise.allSettled(cache.values());
  await Promise.all(
    resolved.map((entry) => {
      if (entry.status === 'fulfilled' && entry.value.ephemeral) {
        return unlinkQuiet(entry.value.path);
      }
      return Promise.resolve();
    })
  );
}

async function attachSoundtrack(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  durationSeconds: number
) {
  try {
    await runFfmpeg(
      [
        '-hide_banner',
        '-y',
        '-i',
        videoPath,
        '-stream_loop',
        '-1',
        '-i',
        audioPath,
        '-t',
        durationSeconds.toFixed(3),
        '-filter_complex',
        '[0:a:0]volume=0.75[src];[1:a:0]volume=0.55[music];[src][music]amix=inputs=2:duration=shortest:dropout_transition=2[aout]',
        '-map',
        '0:v:0',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-shortest',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { timeoutMs: CONCAT_TIMEOUT_MS }
    );
    return;
  } catch {
    // If the stitched video has no source audio, fall back to music-only.
  }

  await runFfmpeg(
    [
      '-hide_banner',
      '-y',
      '-i',
      videoPath,
      '-stream_loop',
      '-1',
      '-i',
      audioPath,
      '-t',
      durationSeconds.toFixed(3),
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { timeoutMs: CONCAT_TIMEOUT_MS }
  );
}

export async function renderWithA7Engine(input: {
  userId: string;
  editId: string;
  config: ShotstackRenderConfig;
}): Promise<A7EngineRenderResult> {
  const maxClips = numericEnv('A7_ENGINE_MAX_CLIPS', DEFAULT_MAX_CLIPS);
  const maxDurationSeconds = numericEnv('A7_ENGINE_MAX_DURATION_SECONDS', DEFAULT_MAX_DURATION_SECONDS);
  const geometry = outputGeometry(input.config.output);
  const warnings: string[] = [];
  const sourceCache = new Map<string, Promise<ResolvedMedia>>();
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'a7-render-'));

  let outputPath = path.join(tempDir, 'export.mp4');
  const stitchedPath = path.join(tempDir, 'stitched.mp4');

  try {
    const planned = planVideoClips(input.config);
    if (planned.length === 0) {
      throw new Error('A7 engine could not find video clips in the render plan.');
    }

    const selected: PlannedClip[] = [];
    let durationSeconds = 0;
    let truncated = false;
    for (const clip of planned) {
      if (selected.length >= maxClips || durationSeconds >= maxDurationSeconds) {
        truncated = true;
        break;
      }
      const remaining = maxDurationSeconds - durationSeconds;
      const length = Math.min(clip.length, remaining);
      if (length <= 0.2) {
        truncated = true;
        break;
      }
      selected.push({ ...clip, length });
      durationSeconds += length;
    }

    const segmentPaths: string[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const plannedClip = selected[index];
      const resolved = await resolveWithCache(plannedClip.source, sourceCache);
      const segmentPath = path.join(tempDir, `segment-${String(index).padStart(4, '0')}.mp4`);
      await runFfmpeg(
        [
          '-hide_banner',
          '-y',
          '-ss',
          plannedClip.trim.toFixed(3),
          '-t',
          plannedClip.length.toFixed(3),
          '-i',
          resolved.path,
          '-vf',
          videoFilter(geometry, plannedClip.filter),
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
          '-movflags',
          '+faststart',
          segmentPath,
        ],
        { timeoutMs: SEGMENT_TIMEOUT_MS }
      );
      segmentPaths.push(segmentPath);
    }

    const listPath = path.join(tempDir, 'concat.txt');
    await fs.writeFile(
      listPath,
      segmentPaths.map((segmentPath) => `file '${writeConcatPath(segmentPath)}'`).join('\n'),
      'utf8'
    );

    await runFfmpeg(
      [
        '-hide_banner',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-movflags',
        '+faststart',
        stitchedPath,
      ],
      { timeoutMs: CONCAT_TIMEOUT_MS }
    );

    const audioSource = soundtrackSource(input.config);
    if (audioSource) {
      try {
        const audio = await resolveWithCache(audioSource, sourceCache);
        await attachSoundtrack(stitchedPath, audio.path, outputPath, durationSeconds);
      } catch (err) {
        warnings.push(`Soundtrack could not be attached: ${err instanceof Error ? err.message : String(err)}`);
        outputPath = stitchedPath;
      }
    } else {
      warnings.push('No soundtrack or user audio was present in the render plan; exported video is silent.');
      outputPath = stitchedPath;
    }

    const outputBuffer = await fs.readFile(outputPath);
    const outputKey = generateVaultKey(
      input.userId,
      'exports',
      `a7-engine-${input.editId}-${Date.now()}.mp4`
    );
    await uploadToR2(outputKey, outputBuffer, 'video/mp4');
    const playbackUrl = await getPresignedDownloadUrl(outputKey, 6 * 3600);

    const report: A7EngineReport = {
      engine: 'a7_native_ffmpeg',
      providerFallbackEligible: true,
      clipsRendered: selected.length,
      uniqueSources: new Set(selected.map((clip) => clip.source)).size,
      durationSeconds: Number(durationSeconds.toFixed(3)),
      output: {
        width: geometry.width,
        height: geometry.height,
        fps: geometry.fps,
        format: 'mp4',
      },
      limits: {
        maxClips,
        maxDurationSeconds,
        truncated,
      },
      capabilities: {
        cuts: 'native',
        sourceSelection: 'render-plan',
        color: 'clip-filter-intent',
        transitions: 'hard-cuts-v1',
        soundtrack: 'attached-if-present',
        vfx: 'basic-scale-crop-filter',
      },
      warnings,
    };

    const vaultFile = await registerVaultFile({
      userId: input.userId,
      r2Key: outputKey,
      filename: `a7-engine-${input.editId}.mp4`,
      contentType: 'video/mp4',
      sizeBytes: outputBuffer.byteLength,
      folder: 'exports',
      source: 'render',
      editId: input.editId,
      metadata: report as unknown as Record<string, unknown>,
      durationMs: Math.round(durationSeconds * 1000),
    });

    return {
      renderId: `${A7_ENGINE_RENDER_ID_PREFIX}${randomUUID()}`,
      outputKey,
      vaultFileId: vaultFile?.id ?? null,
      playbackUrl,
      report,
    };
  } finally {
    await cleanupResolved(sourceCache);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
