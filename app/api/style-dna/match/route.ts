// =============================================================================
// Arrowhead 7 — Style DNA matcher API
// =============================================================================
// POST { editId, styleDNA, options? }
//   -> { renderConfig, soundtrack? }
//
// Pulls the source footage referenced by the edit, analyses it lightly (scene
// detect + audio), composes a Shotstack render config with the matcher, and
// optionally generates a soundtrack via the configured provider.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveSource } from '@/lib/style-dna/source';
import { unlinkQuiet } from '@/lib/style-dna/ffmpeg-runner';
import { extractMetadata, detectScenes } from '@/lib/style-dna/probe';
import { analyzeAudio } from '@/lib/style-dna/audio';
import { RENDER_MEDIA_LIMITS, buildTimelineFromStyleDNA } from '@/lib/shotstack/client';
import {
  assertUserOwnsStorageKey,
  getOwnedPresignedDownloadUrl,
  looksLikeRemoteUrl,
} from '@/lib/vault/ownership';
import { generateSoundtrack, analyseReferenceSoundtrack } from '@/lib/style-dna/soundtrack';
import type { StyleDNA } from '@/types/edit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  editId: z.string().min(1),
  styleDNA: z.unknown(), // validated below — Style DNA is a complex nested shape
  options: z.object({
    targetDuration: z.number().min(2).max(180).optional(),
    platform: z.enum(['tiktok', 'reels', 'shorts', 'youtube', 'square']).optional(),
    outputFormat: z.enum(['mp4', 'webm', 'gif']).optional(),
    outputResolution: z.enum(['sd', 'hd', '1080', '4k']).optional(),
    outputFps: z.number().min(15).max(60).optional(),
    hookText: z.string().optional(),
    ctaText: z.string().optional(),
    editPrompt: z.string().max(500).optional(),
    generateSoundtrack: z.boolean().optional(),
    referenceSoundtrackKey: z.string().optional(),
    userAudioKey: z.string().optional(),
    sourceMedia: z.array(z.object({
      type: z.enum(['video', 'image', 'audio']),
      url: z.string().min(1),
      label: z.string().optional(),
    })).max(100).optional(),
    captions: z.object({
      transcription: z.unknown(),
      style: z.enum(['tiktok-bold', 'youtube-bar', 'karaoke']),
    }).optional(),
  }).optional(),
});

const SOURCE_ANALYSIS_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer!));
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { editId, styleDNA, options } = parsed.data;
    const dna = styleDNA as StyleDNA;
    const sourceMedia = options?.sourceMedia ?? [];
    const primaryMedia = sourceMedia.find((m) => m.type === 'video') ?? null;

    // Fetch the edit so we know the source-video R2 key
    let { data: edit, error } = await supabase
      .from('edits')
      .select('id, source_video_url, user_id')
      .eq('id', editId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !edit) {
      if (!primaryMedia?.url) {
        console.warn('[style-dna/match] missing edit row and no primary source media', {
          editId,
          hasEdit: Boolean(edit),
          sourceMediaCount: sourceMedia.length,
        });
        return NextResponse.json(
          { error: 'A7 could not find this edit. Go back to Source Media and re-add the primary video.' },
          { status: 404 }
        );
      }

      const { data: repairedEdit, error: repairError } = await supabase
        .from('edits')
        .upsert({
          id: editId,
          user_id: user.id,
          title: primaryMedia.label?.replace(/\.[^.]+$/, '') || 'Untitled edit',
          status: 'draft',
          source_video_url: primaryMedia.url,
        })
        .select('id, source_video_url, user_id')
        .single();

      if (repairError || !repairedEdit) {
        console.error('[style-dna/match] failed to repair missing edit row', {
          editId,
          error: repairError?.message,
        });
        return NextResponse.json(
          { error: 'A7 could not save this edit before rendering. Refresh and try again.' },
          { status: 500 }
        );
      }
      edit = repairedEdit;
    }
    if (!edit.source_video_url) {
      if (primaryMedia?.url) {
        const { data: repairedEdit, error: repairError } = await supabase
          .from('edits')
          .update({ source_video_url: primaryMedia.url })
          .eq('id', editId)
          .eq('user_id', user.id)
          .select('id, source_video_url, user_id')
          .single();
        if (!repairError && repairedEdit) {
          edit = repairedEdit;
        }
      }
      if (!edit.source_video_url) {
        console.warn('[style-dna/match] edit has no source footage', {
          editId,
          sourceMediaCount: sourceMedia.length,
        });
        return NextResponse.json(
          { error: 'A7 has no primary video for this edit. Go back to Source Media and add one video clip.' },
          { status: 400 }
        );
      }
    }

    const sourceKey = primaryMedia?.url ?? edit.source_video_url;
    await assertOwnedInputKeys(user.id, [
      sourceKey,
      ...sourceMedia.map((asset) => asset.url),
      options?.referenceSoundtrackKey,
      options?.userAudioKey,
    ]);

    console.info('[style-dna/match] building render config', {
      editId,
      sourceMediaCount: sourceMedia.length,
      hasPrimaryVideo: Boolean(primaryMedia?.url || edit.source_video_url),
      targetDuration: options?.targetDuration ?? 30,
    });
    // Shotstack needs a publicly-fetchable URL; we hand it a 6h presigned URL.
    const renderableUrl = await resolveRenderableUrl(user.id, sourceKey);
    const renderSlate = selectRenderSlate(sourceMedia);
    const renderableSourceMedia = await Promise.all(
      renderSlate.map(async (asset) => ({
        ...asset,
        url: await resolveRenderableUrl(user.id, asset.url),
      }))
    );

    // Analyse source footage locally. This is enhancement, not a hard gate:
    // if download/ffmpeg stalls, render still proceeds with a sane timeline.
    const targetDuration = options?.targetDuration ?? 30;
    const sourceAnalysis = await withTimeout((async () => {
      const resolved = await resolveSource(sourceKey);
      try {
        const meta = await extractMetadata(resolved.path);
        const sourceDuration = meta.duration || targetDuration;
        const analyzeDuration = Math.min(sourceDuration, Math.max(targetDuration * 2, 30), 90);
        const scenes = await detectScenes(resolved.path, analyzeDuration, 0.25);
        const audio = await analyzeAudio(resolved.path, meta.has_audio, analyzeDuration);
        const segments = ensureFullSourceCoverage(
          scenesToSegments(scenes.cuts, sourceDuration, audio.energy_curve, audio.duration_seconds),
          sourceDuration,
          Math.max(targetDuration, analyzeDuration)
        );
        return {
          totalDuration: sourceDuration,
          segments,
          audioBeats: audio.beats,
          hasSpeech: audio.has_speech,
          hasMusic: audio.has_music,
        };
      } finally {
        if (resolved.ephemeral) await unlinkQuiet(resolved.path);
      }
    })(), SOURCE_ANALYSIS_TIMEOUT_MS, 'Source footage analysis').catch((err) => {
      console.warn('[style-dna/match] Source analysis fallback', err instanceof Error ? err.message : err);
      return fallbackSourceAnalysis(targetDuration);
    });

    // Optional: generate a soundtrack matching the reference vibe.
    let soundtrack: { url: string; duration: number; beats: number[]; provider: string } | undefined;
    if (options?.generateSoundtrack) {
      try {
        const promptFeatures = options.referenceSoundtrackKey
          ? await analyseReferenceSoundtrack(options.referenceSoundtrackKey)
          : { prompt: {
              bpm: dna.pacing.bpm_target ?? 120,
              duration_seconds: options.targetDuration ?? 30,
              mood: 'energetic' as const,
              genre_hints: [] as string[],
              energy_shape: dna.energy_arc.shape === 'wave' ? 'wave' as const : 'build' as const,
              spectral_balance: { low: 0.4, mid: 0.4, high: 0.2 },
              text_prompt: `Original ${dna.pacing.overall_energy}-energy instrumental at ${dna.pacing.bpm_target ?? 120} BPM, ${dna.energy_arc.shape} energy arc, no vocals, no copyrighted melodies`,
            } };
        const result = await generateSoundtrack(promptFeatures.prompt);
        if (result.url) {
          soundtrack = {
            url: result.url,
            duration: result.duration_seconds,
            beats: result.beats,
            provider: result.provider,
          };
        }
      } catch (err) {
        console.warn('[style-dna/match] Soundtrack fallback: rendering without generated audio', err instanceof Error ? err.message : err);
      }
    }
    if (!soundtrack) {
      const userAudioKey = options?.userAudioKey
        ?? sourceMedia.find((asset) => asset.type === 'audio')?.url;
      if (userAudioKey) {
        try {
          soundtrack = {
            url: await resolveRenderableUrl(user.id, userAudioKey),
            duration: targetDuration,
            beats: [],
            provider: 'user-upload',
          };
        } catch (err) {
          console.warn('[style-dna/match] User audio fallback: rendering without uploaded audio', err instanceof Error ? err.message : err);
        }
      }
    }

    const promptDirection = options?.editPrompt?.trim();
    const suppressText = promptDirection
      ? /\b(no|remove|without)\s+(text|titles|captions|words|copy)\b/i.test(promptDirection)
      : false;
    const renderConfig = buildTimelineFromStyleDNA({
      sourceVideoUrl: renderableUrl,
      styleDNA: dna,
      sourceAnalysis,
      options: {
        targetDuration: options?.targetDuration,
        platform: options?.platform,
        outputFormat: options?.outputFormat,
        outputResolution: options?.outputResolution,
        outputFps: options?.outputFps,
        hookText: suppressText ? undefined : options?.hookText,
        ctaText: suppressText ? undefined : options?.ctaText,
        editPrompt: promptDirection || undefined,
        sourceMedia: renderableSourceMedia,
        captions: options?.captions ? {
          transcription: options.captions.transcription as any,
          style: options.captions.style,
        } : undefined,
        audioUrl: soundtrack?.url,
        audioDuration: soundtrack?.duration,
        beatTimestamps: soundtrack?.beats,
      },
    });

    // Persist the render config on the edit row.
    const { error: updateError } = await supabase
      .from('edits')
      .update({ render_config: renderConfig, status: 'ready' })
      .eq('id', editId)
      .eq('user_id', user.id);
    if (updateError) {
      console.error('[style-dna/match] failed to persist render config', {
        editId,
        error: updateError.message,
      });
      return NextResponse.json(
        { error: 'A7 built the render plan but could not save it. Try again.' },
        { status: 500 }
      );
    }

    console.info('[style-dna/match] render config ready', {
      editId,
      slateCount: renderableSourceMedia.length,
    });

    return NextResponse.json({ renderConfig, soundtrack });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[style-dna/match]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Match failed' },
      { status: 500 }
    );
  }
}

async function resolveRenderableUrl(userId: string, value: string): Promise<string> {
  if (looksLikeRemoteUrl(value)) return value;
  return getOwnedPresignedDownloadUrl(userId, value, 6 * 3600);
}

async function assertOwnedInputKeys(
  userId: string,
  values: Array<string | null | undefined>
): Promise<void> {
  await Promise.all(
    values
      .filter((value): value is string => Boolean(value && !looksLikeRemoteUrl(value)))
      .map((value) => assertUserOwnsStorageKey(userId, value))
  );
}

function scenesToSegments(
  cuts: number[],
  fallbackDuration = 30,
  energyCurve: number[] = [],
  energyDuration = fallbackDuration
) {
  const out = [] as Array<{
    startTime: number; endTime: number;
    qualityScore: number; motionLevel: number; energyLevel: number;
    contentType: 'b-roll';
  }>;
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    if (end - start < 0.3) continue;
    out.push({
      startTime: start,
      endTime: end,
      qualityScore: 0.65,
      motionLevel: 0.5,
      energyLevel: sampleEnergyAt(energyCurve, energyDuration, (start + end) / 2),
      contentType: 'b-roll',
    });
  }
  if (out.length === 0) {
    return fallbackSourceAnalysis(fallbackDuration).segments;
  }
  return out;
}

function sampleEnergyAt(curve: number[], curveDuration: number, t: number): number {
  if (curve.length === 0 || curveDuration <= 0) return 0.5;
  const idx = Math.min(curve.length - 1, Math.max(0, Math.floor((t / curveDuration) * curve.length)));
  return curve[idx];
}

function ensureFullSourceCoverage(
  detectedSegments: ReturnType<typeof scenesToSegments>,
  sourceDuration: number,
  analyzedDuration: number
) {
  const safeDuration = Math.max(2, Math.min(sourceDuration || 30, 30 * 60));
  const out = [...detectedSegments];
  const coverageStart = Math.max(0, analyzedDuration);
  if (safeDuration <= coverageStart + 1) {
    return out.length > 0 ? out : fallbackSourceAnalysis(safeDuration).segments;
  }

  // Scene detection is capped for serverless reliability, but the editor must
  // still pull from the whole raw video. Add evenly-spaced candidate moments
  // across the unscanned portion so long source videos do not loop the intro.
  const targetSegments = Math.max(8, Math.min(48, Math.ceil(safeDuration / 8)));
  const existingStarts = new Set(out.map((segment) => Math.round(segment.startTime)));
  const step = Math.max(2, safeDuration / targetSegments);
  for (let t = coverageStart; t < safeDuration - 0.5; t += step) {
    const rounded = Math.round(t);
    if (existingStarts.has(rounded)) continue;
    const start = Number(t.toFixed(3));
    const end = Number(Math.min(safeDuration, start + Math.min(3, step)).toFixed(3));
    if (end - start < 0.5) continue;
    out.push({
      startTime: start,
      endTime: end,
      qualityScore: 0.6,
      motionLevel: 0.5,
      energyLevel: 0.55,
      contentType: 'b-roll',
    });
    existingStarts.add(rounded);
  }

  return out.sort((a, b) => a.startTime - b.startTime);
}

function fallbackSourceAnalysis(duration: number) {
  const safeDuration = Math.max(2, Math.min(duration || 30, 30 * 60));
  const targetSegments = Math.max(4, Math.min(48, Math.ceil(safeDuration / 8)));
  const segmentLength = Math.max(1.2, Math.min(3, safeDuration / targetSegments));
  const step = safeDuration / targetSegments;
  const segments = [] as Array<{
    startTime: number; endTime: number;
    qualityScore: number; motionLevel: number; energyLevel: number;
    contentType: 'b-roll';
  }>;
  for (let i = 0; i < targetSegments; i++) {
    const t = i * step;
    segments.push({
      startTime: Number(t.toFixed(3)),
      endTime: Number(Math.min(safeDuration, t + segmentLength).toFixed(3)),
      qualityScore: 0.62,
      motionLevel: 0.5,
      energyLevel: 0.55,
      contentType: 'b-roll',
    });
  }
  return {
    totalDuration: safeDuration,
    segments,
    audioBeats: [],
    hasSpeech: false,
    hasMusic: false,
  };
}

function selectRenderSlate(
  media: Array<{ type: 'video' | 'image' | 'audio'; url: string; label?: string }>
) {
  const primaryVideo = media.find((asset) => asset.type === 'video');
  const rest = media.filter((asset) => asset !== primaryVideo);
  const visuals = rest
    .filter((asset) => asset.type === 'video' || asset.type === 'image')
    .slice(0, RENDER_MEDIA_LIMITS.supplementalVisuals);
  const audio = rest
    .filter((asset) => asset.type === 'audio')
    .slice(0, RENDER_MEDIA_LIMITS.supplementalAudio);
  return [...(primaryVideo ? [primaryVideo] : []), ...visuals, ...audio];
}
