// =============================================================================
// Arrowhead 7 — Style DNA Matcher
// =============================================================================
// Takes a Style DNA profile + raw source footage and produces a Shotstack
// render config that recreates the reference's editing FEEL with the user's
// own footage.
//
// Source analysis is done in `analyseSourceFootage` (light pass: ffprobe scene
// detect + audio). The matcher then builds a timeline skeleton from the DNA's
// pacing / energy arc, assigns source segments to slots scored by quality and
// energy match, applies the DNA's rhythm distribution, picks transitions
// weighted by DNA + context, applies color grading, builds the audio track
// (with optional soundtrack), and returns a render config ready for Shotstack.

import type {
  StyleDNA,
  ShotstackRenderConfig,
  ShotstackTimeline,
  ShotstackTrack,
  ShotstackClip,
  ShotstackOutput,
  CutPattern,
  ColorProfile,
  EnergyArc,
  TransitionPreference,
  MotionProfile,
  NarrativeStructure,
  TextStyleProfile,
} from '@/types/edit';
import { isFfmpegAvailable, unlinkQuiet } from './ffmpeg-runner';
import { resolveSource } from './source';
import { extractMetadata, detectScenes } from './probe';
import { analyzeAudio } from './audio';

// ─── Public API ─────────────────────────────────────────────────────────────

export interface MatcherOptions {
  /** Target output duration in seconds (default 30). */
  targetDuration?: number;
  /** Optional override soundtrack URL (Shotstack-accessible). */
  audioUrl?: string;
  /** Duration of the override soundtrack. */
  audioDuration?: number;
  /** Beat timestamps for the soundtrack (used for beat-sync snapping). */
  beatTimestamps?: number[];
  outputFormat?: 'mp4' | 'webm' | 'gif';
  outputResolution?: 'sd' | 'hd' | '1080' | '4k';
  outputFps?: number;
  /** Target platform — chooses the aspect ratio when DNA doesn't pin one. */
  platform?: 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'square';
  textOverlays?: Array<{ text: string; timestamp: number; duration: number }>;
  hookText?: string;
  ctaText?: string;
  /** Public, Shotstack-fetchable URL for the source footage. Required. */
  sourceVideoUrl: string;
}

/**
 * Apply a Style DNA profile to source footage, returning a Shotstack render
 * configuration. Throws if the source footage cannot be analysed.
 */
export async function applyStyleDNA(
  sourceLocalPath: string,
  styleDNA: StyleDNA,
  options: MatcherOptions
): Promise<ShotstackRenderConfig> {
  if (!options.sourceVideoUrl) {
    throw new Error('MatcherOptions.sourceVideoUrl is required (Shotstack-accessible URL)');
  }
  const sourceAnalysis = await analyseSourceFootage(sourceLocalPath);
  return buildRenderConfig(styleDNA, sourceAnalysis, options);
}

/**
 * Same as applyStyleDNA but takes a reference (R2 key, presigned URL, etc.)
 * and downloads it for analysis.
 */
export async function applyStyleDNAFromReference(
  sourceReference: string,
  styleDNA: StyleDNA,
  options: MatcherOptions
): Promise<ShotstackRenderConfig> {
  const resolved = await resolveSource(sourceReference);
  try {
    return await applyStyleDNA(resolved.path, styleDNA, options);
  } finally {
    if (resolved.ephemeral) await unlinkQuiet(resolved.path);
  }
}

// ─── Source footage analysis ────────────────────────────────────────────────

export interface SourceSegment {
  startTime: number;
  endTime: number;
  qualityScore: number;
  motionLevel: number;
  energyLevel: number;
  contentType: 'action' | 'talking' | 'b-roll' | 'transition' | 'static';
}

export interface SourceAnalysis {
  totalDuration: number;
  segments: SourceSegment[];
  audioBeats: number[];
  hasSpeech: boolean;
  hasMusic: boolean;
}

async function analyseSourceFootage(filePath: string): Promise<SourceAnalysis> {
  if (!(await isFfmpegAvailable())) {
    // No FFmpeg — produce a single 30s "whole video" segment so the matcher
    // can still output a valid timeline (just less interesting).
    return {
      totalDuration: 30,
      segments: [{
        startTime: 0,
        endTime: 30,
        qualityScore: 0.6,
        motionLevel: 0.5,
        energyLevel: 0.5,
        contentType: 'b-roll',
      }],
      audioBeats: [],
      hasSpeech: false,
      hasMusic: false,
    };
  }

  const metadata = await extractMetadata(filePath);
  const duration = metadata.duration || 30;
  const scenes = await detectScenes(filePath, duration, 0.25);
  const audio = await analyzeAudio(filePath, metadata.has_audio);

  // Build segments from scene boundaries. Filter out sub-300ms slivers (showinfo
  // noise) and sub-2s segments unless we have very few of them.
  const segments: SourceSegment[] = [];
  for (let i = 0; i < scenes.cuts.length - 1; i++) {
    const start = scenes.cuts[i];
    const end = scenes.cuts[i + 1];
    const segDuration = end - start;
    if (segDuration < 0.3) continue;
    // Energy at this point from the audio curve (if any).
    const energy = sampleEnergyAt(audio.energy_curve, audio.duration_seconds, (start + end) / 2);
    segments.push({
      startTime: start,
      endTime: end,
      qualityScore: 0.6 + Math.min(0.3, segDuration / 10),
      motionLevel: 0.5,
      energyLevel: energy,
      contentType: audio.has_speech && energy > 0.4 ? 'talking' : 'b-roll',
    });
  }
  if (segments.length === 0) {
    // Single-shot footage — slice into 2-3s pieces so the matcher has slots.
    const slice = 2.5;
    for (let t = 0; t + slice <= duration; t += slice) {
      segments.push({
        startTime: t,
        endTime: t + slice,
        qualityScore: 0.55,
        motionLevel: 0.5,
        energyLevel: 0.5,
        contentType: 'b-roll',
      });
    }
  }

  return {
    totalDuration: duration,
    segments,
    audioBeats: audio.beats,
    hasSpeech: audio.has_speech,
    hasMusic: audio.has_music,
  };
}

function sampleEnergyAt(curve: number[], curveDuration: number, t: number): number {
  if (curve.length === 0 || curveDuration <= 0) return 0.5;
  const idx = Math.min(curve.length - 1, Math.max(0, Math.floor((t / curveDuration) * curve.length)));
  return curve[idx];
}

// ─── Render config builder ──────────────────────────────────────────────────

export function buildRenderConfig(
  dna: StyleDNA,
  source: SourceAnalysis,
  options: MatcherOptions
): ShotstackRenderConfig {
  const safeSourceDuration = Number.isFinite(source.totalDuration) && source.totalDuration > 0.4
    ? source.totalDuration
    : Math.max(5, options.targetDuration ?? 30);
  const targetDuration = Math.max(
    1,
    Math.min(options.targetDuration ?? Math.min(safeSourceDuration, 30), safeSourceDuration)
  );
  const sourceSegments = source.segments.length > 0
    ? source.segments
    : [{
        startTime: 0,
        endTime: safeSourceDuration,
        qualityScore: 0.8,
        motionLevel: 0.5,
        energyLevel: 0.5,
        contentType: 'b-roll' as const,
      }];

  const skeleton = buildTimelineSkeleton(dna, targetDuration);
  const assigned = assignSegmentsToTimeline(sourceSegments, skeleton, dna);
  const rhythmAdjusted = applyRhythmPatterns(assigned, dna.cut_pattern);

  let videoClips = buildVideoClips(rhythmAdjusted, dna, options.sourceVideoUrl);
  videoClips = applyMotionEffects(videoClips, dna.motion_profile);

  // Beat-snap if we have beats (either DNA-provided or option-provided)
  const beats = options.beatTimestamps ?? (dna.audio_sync_strategy === 'beat-sync' ? source.audioBeats : []);
  if (beats.length > 0) {
    videoClips = syncToBeats(videoClips, beats);
  }

  if (dna.narrative_structure) {
    videoClips = applyNarrativeStructure(videoClips, dna.narrative_structure);
  }

  const tracks: ShotstackTrack[] = [{ clips: videoClips }];

  const textTrack = dna.text_style
    ? buildTextOverlayTrack(rhythmAdjusted, dna.text_style, options)
    : undefined;
  if (textTrack) tracks.push(textTrack);

  const audioTrack = buildAudioTrack(dna, options, targetDuration);
  if (audioTrack) tracks.push(audioTrack);

  const timeline: ShotstackTimeline = {
    tracks,
    background: '#000000',
  };

  const output = resolveOutput(dna, options);
  return { timeline, output };
}

function resolveOutput(dna: StyleDNA, options: MatcherOptions): ShotstackOutput {
  const aspect = dna.framing_profile.aspect_ratio_preference;
  const platform = options.platform;
  const size = sizeForPlatformOrAspect(platform, aspect, options.outputResolution ?? '1080');
  return {
    format: options.outputFormat || 'mp4',
    resolution: options.outputResolution || '1080',
    fps: options.outputFps || 30,
    quality: 'high',
    size,
  };
}

function sizeForPlatformOrAspect(
  platform: MatcherOptions['platform'],
  aspect: string,
  resolution: 'sd' | 'hd' | '1080' | '4k'
): { width: number; height: number } | undefined {
  // Shotstack uses size to override resolution when set. For social verticals
  // we want 1080x1920; squares 1080x1080; landscape sticks with the resolution
  // shorthand (which is 1920x1080 for 1080p).
  const base = { sd: 854, hd: 1280, '1080': 1920, '4k': 3840 }[resolution];
  if (platform === 'tiktok' || platform === 'reels' || platform === 'shorts' || aspect === '9:16') {
    return { width: base === 3840 ? 2160 : base === 1920 ? 1080 : base === 1280 ? 720 : 480, height: base };
  }
  if (platform === 'square' || aspect === '1:1') {
    return { width: base, height: base };
  }
  if (aspect === '4:5') {
    const h = base;
    return { width: Math.round(h * 0.8), height: h };
  }
  return undefined; // 16:9 handled by resolution
}

// ─── Timeline skeleton ──────────────────────────────────────────────────────

interface TimelineSlot {
  startTime: number;
  duration: number;
  targetEnergy: number;
  slotType: 'content' | 'hook' | 'intro' | 'outro' | 'breathing';
  preferredCutType?: string;
}

function buildTimelineSkeleton(dna: StyleDNA, targetDuration: number): TimelineSlot[] {
  const slots: TimelineSlot[] = [];
  let cursor = 0;

  // Sample durations from the cut histogram so the rhythm matches the reference's
  // probability distribution rather than a uniform mean.
  const histDurations = sampleHistogramDurations(dna.cut_pattern, targetDuration);
  let histIdx = 0;

  // Reserve hook slot at the front if narrative says so.
  if (dna.narrative_structure?.has_hook) {
    const hookSec = Math.max(0.8, (dna.narrative_structure.hook_duration_ms ?? 2000) / 1000);
    slots.push({
      startTime: 0,
      duration: hookSec,
      targetEnergy: 0.9,
      slotType: 'hook',
      preferredCutType: 'smash-cut',
    });
    cursor = hookSec;
  }

  while (cursor < targetDuration - 0.1) {
    const baseDur = histDurations[histIdx % histDurations.length] / 1000;
    histIdx++;
    const dur = Math.min(baseDur, Math.max(0.4, targetDuration - cursor));
    const arcEnergy = sampleArc(dna.energy_arc, cursor / targetDuration);
    const breathingDue =
      dna.cut_pattern.has_breathing_moments &&
      dna.cut_pattern.breathing_interval_ms &&
      Math.floor(cursor / (dna.cut_pattern.breathing_interval_ms / 1000)) >
        Math.floor((cursor - dur) / (dna.cut_pattern.breathing_interval_ms / 1000));

    if (breathingDue) {
      const breathDur = Math.min(dur * 2, targetDuration - cursor);
      slots.push({
        startTime: cursor,
        duration: breathDur,
        targetEnergy: arcEnergy * 0.5,
        slotType: 'breathing',
      });
      cursor += breathDur;
    } else {
      slots.push({
        startTime: cursor,
        duration: dur,
        targetEnergy: arcEnergy,
        slotType: 'content',
        preferredCutType: selectWeightedType(dna.cut_pattern.cut_types),
      });
      cursor += dur;
    }
  }

  // Outro CTA slot if DNA asks for it
  if (dna.narrative_structure?.has_outro_cta && slots.length > 1) {
    const last = slots[slots.length - 1];
    last.slotType = 'outro';
    last.targetEnergy = Math.max(0.4, last.targetEnergy * 0.7);
  }

  return slots;
}

function sampleHistogramDurations(cut: CutPattern, targetDuration: number): number[] {
  // Bucket centres in ms (mid-point of each histogram bucket; last bucket open)
  const centres = [250, 750, 1500, 2500, 4000, 7500, 12000];
  const hist = cut.duration_histogram.length === centres.length
    ? cut.duration_histogram
    : [0.1, 0.3, 0.3, 0.15, 0.1, 0.04, 0.01];
  // Build a weighted sample list of, say, 64 durations from the histogram.
  const samples: number[] = [];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    let cumulative = 0;
    for (let b = 0; b < centres.length; b++) {
      cumulative += hist[b];
      if (r <= cumulative) {
        // Jitter ±25% inside the bucket so we don't end up with identical lengths
        samples.push(centres[b] * (0.75 + Math.random() * 0.5));
        break;
      }
    }
  }
  // If the sampled mean is way off the target avg, scale to nudge toward it
  const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const wanted = cut.avg_cut_duration_ms || targetDuration * 1000 / 12;
  if (sampleMean > 0 && Math.abs(wanted - sampleMean) > wanted * 0.2) {
    const scale = wanted / sampleMean;
    return samples.map((s) => Math.max(300, Math.min(15000, s * scale)));
  }
  if (samples.length === 0) return [Math.max(300, Math.min(15000, wanted || 1500))];
  return samples.map((s) => Math.max(300, Math.min(15000, s)));
}

function sampleArc(arc: EnergyArc, t: number): number {
  if (arc.curve.length === 0) return 0.5;
  const idx = Math.min(arc.curve.length - 1, Math.max(0, Math.floor(t * arc.curve.length)));
  return arc.curve[idx];
}

function selectWeightedType<T extends { type: string; weight: number }>(items: T[]): string {
  if (items.length === 0) return 'hard-cut';
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.type;
  }
  return items[0].type;
}

// ─── Segment assignment ─────────────────────────────────────────────────────

interface AssignedSegment {
  segment: SourceSegment;
  slot: TimelineSlot;
}

function assignSegmentsToTimeline(
  segments: SourceSegment[],
  slots: TimelineSlot[],
  dna: StyleDNA
): AssignedSegment[] {
  if (segments.length === 0) return [];
  const used = new Map<number, number>(); // segment index -> times used
  const out: AssignedSegment[] = [];

  for (const slot of slots) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.endTime - seg.startTime < slot.duration * 0.6) continue; // too short
      const reuseCount = used.get(i) || 0;
      const energyMatch = 1 - Math.abs(seg.energyLevel - slot.targetEnergy);
      const quality = seg.qualityScore;
      const variety = 1 / (1 + reuseCount);
      const slotPref =
        slot.slotType === 'hook' ? (seg.energyLevel > 0.6 ? 0.3 : -0.2) :
        slot.slotType === 'breathing' ? (seg.energyLevel < 0.5 ? 0.2 : -0.1) :
        0;
      // Color profile alignment: prefer brighter segments at high-energy slots,
      // darker ones at breathing slots. We don't have per-segment color here,
      // but slot energy already encodes the proxy.
      const score = energyMatch * 0.5 + quality * 0.3 + variety * 0.2 + slotPref;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      // Fall back to the longest available segment
      let longest = 0;
      let longestIdx = 0;
      segments.forEach((s, i) => {
        const d = s.endTime - s.startTime;
        if (d > longest) {
          longest = d;
          longestIdx = i;
        }
      });
      bestIdx = longestIdx;
    }
    used.set(bestIdx, (used.get(bestIdx) || 0) + 1);
    out.push({ slot, segment: segments[bestIdx] });
  }

  void dna; // accepted for future weighting (e.g. content-type preference)
  return out;
}

// ─── Rhythm adjustment ──────────────────────────────────────────────────────

function applyRhythmPatterns(assigned: AssignedSegment[], cut: CutPattern): AssignedSegment[] {
  if (assigned.length < 3) return assigned;
  // For accelerating rhythms, progressively shorten slot durations toward the
  // end (down to a floor of 60% of the original). For decelerating, do the
  // opposite. Variable / syncopated rhythms are left alone — the histogram
  // sampler in the skeleton already handles them.
  if (cut.cut_rhythm === 'accelerating') {
    return assigned.map((a, i) => {
      const t = i / (assigned.length - 1);
      const factor = 1 - t * 0.4;
      return { ...a, slot: { ...a.slot, duration: a.slot.duration * factor } };
    });
  }
  if (cut.cut_rhythm === 'decelerating') {
    return assigned.map((a, i) => {
      const t = i / (assigned.length - 1);
      const factor = 0.6 + t * 0.4;
      return { ...a, slot: { ...a.slot, duration: a.slot.duration * factor } };
    });
  }
  return assigned;
}

// ─── Video clip construction ────────────────────────────────────────────────

function buildVideoClips(
  assigned: AssignedSegment[],
  dna: StyleDNA,
  sourceVideoUrl: string
): ShotstackClip[] {
  let cursor = 0;
  const filter = mapColorProfileToFilter(dna.color_profile);

  return assigned.map((a, index) => {
    const available = Math.max(0.4, a.segment.endTime - a.segment.startTime);
    const length = Math.max(0.4, Math.min(a.slot.duration, available));
    const transition = selectTransition(dna.transition_preferences, a.slot, index, assigned.length, dna.energy_arc);
    const clip: ShotstackClip = {
      asset: {
        type: 'video',
        src: sourceVideoUrl,
        trim: Number(a.segment.startTime.toFixed(3)),
        volume: dna.audio_sync_strategy === 'none' ? 1 : 0,
      },
      start: Number(cursor.toFixed(3)),
      length: Number(length.toFixed(3)),
    };
    if (transition) clip.transition = { in: transition };
    if (filter) clip.filter = filter;
    cursor += length;
    return clip;
  });
}

function selectTransition(
  preferences: TransitionPreference[],
  slot: TimelineSlot,
  index: number,
  totalClips: number,
  arc: EnergyArc
): string | null {
  if (preferences.length === 0 || index === 0) return null;
  const position = index / Math.max(1, totalClips - 1);
  const energy = sampleArc(arc, position);
  const adjusted = preferences.map((p) => {
    let w = p.weight;
    if (energy > 0.7 && p.type === 'cut') w *= 1.4;
    if (energy < 0.3 && p.type === 'dissolve') w *= 1.4;
    if (slot.slotType === 'breathing' && p.type === 'dissolve') w *= 1.8;
    if (slot.slotType === 'hook' && p.type === 'whip') w *= 1.4;
    return { type: p.type, weight: w };
  });
  const total = adjusted.reduce((s, p) => s + p.weight, 0) || 1;
  let r = Math.random() * total;
  for (const p of adjusted) {
    r -= p.weight;
    if (r <= 0) return mapTransitionType(p.type);
  }
  return null;
}

function mapTransitionType(type: TransitionPreference['type']): string | null {
  switch (type) {
    case 'cut': return null;
    case 'dissolve': return 'fade';
    case 'wipe': return 'slideLeft';
    case 'zoom': return 'zoom';
    case 'whip': return 'slideRight';
    case 'glitch': return 'fade'; // Shotstack approximation
    case 'none': return null;
    default: return null;
  }
}

function mapColorProfileToFilter(profile: ColorProfile): string | null {
  // Shotstack's built-in filters are coarse. Pick the closest match; in the
  // future we'll render a LUT via FFmpeg and apply post-render.
  if (profile.contrast >= 130) return 'contrast';
  if (profile.brightness <= 80) return 'darken';
  if (profile.brightness >= 130) return 'lighten';
  if (profile.saturation <= 60) return 'greyscale';
  if (profile.saturation >= 130) return 'boost';
  return null;
}

// ─── Motion effects ─────────────────────────────────────────────────────────

function applyMotionEffects(clips: ShotstackClip[], motion?: MotionProfile): ShotstackClip[] {
  if (!motion) return clips;
  // Shotstack supports "zoomIn", "zoomOut", "slideLeft", etc. as effects on
  // individual clips. We use zoomIn as a stand-in for zoom-punches: applied to
  // a subset of clips proportional to motion.zoom_punch_frequency.
  if (!motion.uses_zoom_punches || motion.zoom_punch_frequency <= 0) return clips;
  const ratio = Math.min(0.5, motion.zoom_punch_frequency / Math.max(1, clips.length));
  return clips.map((clip, i) => {
    if (Math.random() < ratio && i > 0) {
      return { ...clip, effect: 'zoomIn' };
    }
    return clip;
  });
}

// ─── Text overlay track ─────────────────────────────────────────────────────

function buildTextOverlayTrack(
  assigned: AssignedSegment[],
  style: TextStyleProfile,
  options: MatcherOptions
): ShotstackTrack | undefined {
  const clips: ShotstackClip[] = [];
  const style_string = `font-family:${style.font_family};color:${style.text_color};font-weight:${style.font_weight}`;

  if (options.hookText) {
    clips.push({
      asset: { type: 'title', text: options.hookText, style: style_string },
      start: 0,
      length: 2,
      position: 'center',
      transition: { in: mapTextAnimation(style.animation), out: 'fade' },
    });
  }
  if (options.textOverlays) {
    for (const overlay of options.textOverlays) {
      clips.push({
        asset: { type: 'title', text: overlay.text, style: style_string },
        start: overlay.timestamp,
        length: overlay.duration,
        position: style.position === 'lower-third' ? 'bottom' : (style.position as ShotstackClip['position']),
      });
    }
  }
  if (options.ctaText && assigned.length > 0) {
    const last = assigned[assigned.length - 1];
    const ctaStart = Math.max(0, last.slot.startTime + last.slot.duration - 3);
    clips.push({
      asset: { type: 'title', text: options.ctaText, style: style_string },
      start: Number(ctaStart.toFixed(3)),
      length: 3,
      position: 'center',
      transition: { in: 'fade', out: 'fade' },
    });
  }
  return clips.length > 0 ? { clips } : undefined;
}

function mapTextAnimation(animation: TextStyleProfile['animation']): string {
  switch (animation) {
    case 'fade': return 'fade';
    case 'slide': return 'slideUp';
    case 'typewriter': return 'fade';
    case 'glitch': return 'fade';
    case 'none': return 'fade';
    default: return 'fade';
  }
}

// ─── Audio track ────────────────────────────────────────────────────────────

function buildAudioTrack(
  dna: StyleDNA,
  options: MatcherOptions,
  targetDuration: number
): ShotstackTrack | undefined {
  if (!options.audioUrl) return undefined;
  const ducks = dna.audio_edit_relationship.music_ducks_under_speech;
  return {
    clips: [
      {
        asset: {
          type: 'audio',
          src: options.audioUrl,
          volume: ducks ? 0.35 : 1,
          effect: 'fadeInFadeOut',
        },
        start: 0,
        length: options.audioDuration ?? targetDuration,
      },
    ],
  };
}

// ─── Narrative reordering ───────────────────────────────────────────────────

function applyNarrativeStructure(
  clips: ShotstackClip[],
  narrative: NarrativeStructure
): ShotstackClip[] {
  if (clips.length < 3) return clips;
  // For non-linear storytelling, pull the brightest/most-changing-looking clip
  // (proxy: shortest length at high energy zone) to the front when there's a
  // hook. We don't have full content-aware reordering yet, so this is a best
  // effort that improves on chronological-only.
  if (narrative.storytelling_style === 'nonlinear' && narrative.has_hook) {
    const sorted = [...clips].sort((a, b) => a.length - b.length);
    const punchy = sorted[0];
    if (punchy && punchy !== clips[0]) {
      const filtered = clips.filter((c) => c !== punchy);
      // Re-flow start times
      let cursor = 0;
      const placed = [punchy, ...filtered].map((c) => {
        const out = { ...c, start: Number(cursor.toFixed(3)) };
        cursor += c.length;
        return out;
      });
      return placed;
    }
  }
  return clips;
}

// ─── Beat sync ──────────────────────────────────────────────────────────────

export function syncToBeats(
  clips: ShotstackClip[],
  beatTimestamps: number[],
  toleranceMs = 200
): ShotstackClip[] {
  if (beatTimestamps.length === 0 || clips.length === 0) return clips;
  const beats = [...beatTimestamps].sort((a, b) => a - b);
  const tol = toleranceMs / 1000;

  const out: ShotstackClip[] = [];
  let cursor = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (i === 0) {
      out.push({ ...clip, start: 0 });
      cursor = clip.length;
      continue;
    }
    // find nearest beat to where this clip would naturally start
    const wanted = cursor;
    let bestDelta = Infinity;
    let snapped = wanted;
    for (const b of beats) {
      const d = Math.abs(b - wanted);
      if (d < bestDelta) {
        bestDelta = d;
        snapped = b;
      }
      if (b > wanted + tol) break;
    }
    const snap = bestDelta <= tol ? snapped : wanted;
    const previous = out[out.length - 1];
    if (previous) {
      previous.length = Number(Math.max(0.3, snap - previous.start).toFixed(3));
    }
    out.push({ ...clip, start: Number(snap.toFixed(3)) });
    cursor = snap + clip.length;
  }
  return out;
}

// ─── Style DNA comparison ───────────────────────────────────────────────────

export function compareStyleDNA(a: StyleDNA, b: StyleDNA): {
  overall: number;
  rhythm: number;
  color: number;
  pacing: number;
  transitions: number;
} {
  const denomRhythm = Math.max(a.cut_pattern.avg_cut_duration_ms, b.cut_pattern.avg_cut_duration_ms, 1);
  const rhythm = 1 - Math.abs(a.cut_pattern.avg_cut_duration_ms - b.cut_pattern.avg_cut_duration_ms) / denomRhythm;
  const color = 1 - (
    Math.abs(a.color_profile.temperature - b.color_profile.temperature) / 200 +
    Math.abs(a.color_profile.saturation - b.color_profile.saturation) / 200 +
    Math.abs(a.color_profile.contrast - b.color_profile.contrast) / 200
  ) / 3;
  const energyMap = { low: 0.25, medium: 0.5, high: 0.75, extreme: 1.0 } as const;
  const pacing = 1 - Math.abs(energyMap[a.pacing.overall_energy] - energyMap[b.pacing.overall_energy]);
  const types = ['cut', 'dissolve', 'wipe', 'zoom', 'whip', 'glitch', 'none'] as const;
  const av = types.map((t) => a.transition_preferences.find((p) => p.type === t)?.weight || 0);
  const bv = types.map((t) => b.transition_preferences.find((p) => p.type === t)?.weight || 0);
  const dot = av.reduce((s, v, i) => s + v * bv[i], 0);
  const magA = Math.sqrt(av.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(bv.reduce((s, v) => s + v * v, 0));
  const transitions = magA && magB ? dot / (magA * magB) : 0;
  return {
    overall: clamp01(rhythm * 0.35 + color * 0.15 + pacing * 0.3 + transitions * 0.2),
    rhythm: clamp01(rhythm),
    color: clamp01(color),
    pacing: clamp01(pacing),
    transitions: clamp01(transitions),
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
