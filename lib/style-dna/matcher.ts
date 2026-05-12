// =============================================================================
// Arrowhead 7 — Style DNA Matcher
// =============================================================================
// Takes a Style DNA profile and applies it to source footage.
// Generates the Shotstack render config that produces the final edit.
//
// This is NOT just color correction or shot selection. The matcher rebuilds
// the ENTIRE editing language from the Style DNA: cut rhythm, breathing
// patterns, transition vocabulary, energy arc, audio-visual sync, motion
// techniques, narrative structure, and text overlay styling.
//
// A user drops a reference reel from a creator they admire, A7 extracts the
// Style DNA, and the matcher rebuilds that exact editing FEEL with the user's
// own footage — same rhythm, same energy, same craft.

import type {
  StyleDNA,
  ShotstackRenderConfig,
  ShotstackTimeline,
  ShotstackTrack,
  ShotstackClip,
  ShotstackOutput,
  CutPattern,
  ColorProfile,
  PacingProfile,
  EnergyArc,
  TransitionPreference,
  AudioEditRelationship,
  MotionProfile,
  NarrativeStructure,
  TextStyleProfile,
} from '@/types/edit';

// ─── Main Matcher ────────────────────────────────────────────────────────────

/**
 * Apply a Style DNA profile to source footage, generating a Shotstack render config.
 *
 * This is the core creative engine of Arrowhead 7.
 *
 * Process:
 *  1. Analyze source footage (scenes, quality, motion, audio)
 *  2. Build an energy-mapped timeline from the DNA's energy arc
 *  3. Select best source segments per timeline slot (CLIP embeddings + quality)
 *  4. Apply the DNA's cut rhythm and breathing patterns
 *  5. Map transitions from the DNA's transition vocabulary
 *  6. Apply audio-edit relationship (J-cuts, L-cuts, beat sync, silence)
 *  7. Apply motion techniques (speed ramps, zoom punches)
 *  8. Apply color grading from DNA
 *  9. Add text overlays matching DNA text style
 * 10. Apply narrative structure (hook, intro, segments, CTA)
 * 11. Generate complete Shotstack timeline
 */
export async function applyStyleDNA(
  sourceVideoUrl: string,
  styleDNA: StyleDNA,
  options: MatcherOptions = {}
): Promise<ShotstackRenderConfig> {
  // Step 1: Deep analysis of source content
  const sourceAnalysis = await analyzeSourceContent(sourceVideoUrl);

  // Step 2: Build energy-mapped timeline skeleton from DNA
  const timelineSkeleton = buildTimelineSkeleton(styleDNA, options);

  // Step 3: Select and assign source segments to timeline slots
  const assignedSegments = assignSegmentsToTimeline(
    sourceAnalysis.segments, timelineSkeleton, styleDNA.cut_pattern
  );

  // Step 4: Apply cut rhythm and breathing patterns
  const rhythmAdjusted = applyRhythmPatterns(
    assignedSegments, styleDNA.cut_pattern
  );

  // Step 5: Build video clips with transitions
  const videoClips = buildClipsWithTransitions(
    rhythmAdjusted, styleDNA
  );

  // Step 6: Build audio relationships (J-cuts, L-cuts, ducking)
  const audioTrack = buildAudioTrack(
    rhythmAdjusted, styleDNA, options
  );

  // Step 7: Build motion effects track (speed ramps, zoom punches)
  const motionClips = styleDNA.motion_profile
    ? applyMotionEffects(videoClips, styleDNA.motion_profile)
    : videoClips;

  // Step 8: Build text overlay track
  const textTrack = styleDNA.text_style
    ? buildTextOverlayTrack(rhythmAdjusted, styleDNA.text_style, options)
    : undefined;

  // Step 9: Apply narrative structure (hook reordering, CTA placement)
  const structuredClips = styleDNA.narrative_structure
    ? applyNarrativeStructure(motionClips, styleDNA.narrative_structure, sourceAnalysis)
    : motionClips;

  // Step 10: Assemble final timeline
  const timeline: ShotstackTimeline = {
    tracks: [
      { clips: structuredClips },            // Main video
      ...(textTrack ? [textTrack] : []),      // Text overlays
      ...(audioTrack ? [audioTrack] : []),    // Audio/soundtrack
    ],
    background: '#000000',
  };

  // Step 11: Configure output
  const output: ShotstackOutput = {
    format: options.outputFormat || 'mp4',
    resolution: options.outputResolution || '1080',
    fps: options.outputFps || 30,
    quality: 'high',
  };

  return { timeline, output };
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface MatcherOptions {
  /** Target output duration in seconds */
  targetDuration?: number;
  /** Override audio track URL */
  audioUrl?: string;
  /** Audio track duration in seconds */
  audioDuration?: number;
  /** Beat timestamps for audio sync (seconds) */
  beatTimestamps?: number[];
  /** Output format */
  outputFormat?: 'mp4' | 'webm' | 'gif';
  /** Output resolution */
  outputResolution?: 'sd' | 'hd' | '1080' | '4k';
  /** Output FPS */
  outputFps?: number;
  /** Text overlays to add (e.g., captions, titles) */
  textOverlays?: Array<{ text: string; timestamp: number; duration: number }>;
  /** Hook text (shown in first 1-3 seconds if DNA has cold open) */
  hookText?: string;
  /** CTA text (shown at end if DNA has outro CTA) */
  ctaText?: string;
}

// ─── Source Content Analysis ────────────────────────────────────────────────

interface SourceAnalysis {
  segments: SourceSegment[];
  totalDuration: number;
  audioBeats: number[];
  hasSpeech: boolean;
  hasMusic: boolean;
}

interface SourceSegment {
  startTime: number;           // Seconds into source video
  endTime: number;
  qualityScore: number;        // 0-1, visual quality/interest
  motionLevel: number;         // 0-1, amount of motion
  energyLevel: number;         // 0-1, visual energy/intensity
  brightness: number;          // 0-1
  dominantColors: string[];
  hasText: boolean;            // Contains on-screen text
  hasFace: boolean;            // Contains a human face
  contentType: 'action' | 'talking' | 'b-roll' | 'transition' | 'static';
  // CLIP embedding for semantic similarity matching
  clipEmbedding?: number[];    // TODO: CLIP vector for semantic search
}

async function analyzeSourceContent(_videoUrl: string): Promise<SourceAnalysis> {
  // TODO: Full source analysis pipeline
  //
  // 1. FFmpeg scene detection → segment boundaries
  // 2. Per segment:
  //    a. Quality scoring (sharpness, exposure, framing)
  //    b. Motion analysis (optical flow magnitude)
  //    c. Energy level (motion + color variance + content density)
  //    d. Face detection (for talking head segments)
  //    e. Text detection (for segments with on-screen text)
  //    f. CLIP embedding (for semantic similarity to reference shots)
  //    g. Content type classification
  // 3. Audio analysis: beat detection, speech detection, music detection
  //
  // The CLIP embedding is KEY for shot matching — it lets us find source footage
  // segments that are semantically similar to reference video segments,
  // not just visually similar. "A wide shot of mountains" matches regardless
  // of which mountains.

  return {
    segments: [
      {
        startTime: 0,
        endTime: 5,
        qualityScore: 0.8,
        motionLevel: 0.5,
        energyLevel: 0.6,
        brightness: 0.6,
        dominantColors: ['#333333'],
        hasText: false,
        hasFace: false,
        contentType: 'b-roll',
      },
    ],
    totalDuration: 5,
    audioBeats: [],
    hasSpeech: false,
    hasMusic: false,
  };
}

// ─── Timeline Skeleton ──────────────────────────────────────────────────────

interface TimelineSlot {
  startTime: number;           // Position in output timeline
  duration: number;            // How long this slot lasts
  targetEnergy: number;        // 0-1, energy level for this slot
  slotType: 'content' | 'hook' | 'intro' | 'outro' | 'breathing';
  cutType?: string;            // Preferred cut type entering this slot
}

/**
 * Build a timeline skeleton from the DNA's energy arc and pacing.
 * This defines WHEN cuts happen and at what energy level —
 * before we even look at the source footage.
 */
function buildTimelineSkeleton(
  dna: StyleDNA,
  options: MatcherOptions
): TimelineSlot[] {
  const targetDuration = options.targetDuration || 30;
  const slots: TimelineSlot[] = [];
  let currentTime = 0;

  // Use pacing sections to determine cut density per region
  const sections = dna.pacing.sections.length > 0
    ? dna.pacing.sections
    : [{ start_pct: 0, end_pct: 1, energy: dna.pacing.overall_energy, cuts_per_minute: dna.cut_pattern.cuts_per_minute }];

  for (const section of sections) {
    const sectionStart = section.start_pct * targetDuration;
    const sectionEnd = section.end_pct * targetDuration;
    const sectionDuration = sectionEnd - sectionStart;
    const cutsInSection = Math.max(1, Math.round((section.cuts_per_minute / 60) * sectionDuration));
    const clipDuration = sectionDuration / cutsInSection;

    // Map energy level to 0-1
    const energyMap = { low: 0.25, medium: 0.5, high: 0.75, extreme: 1.0 };
    const baseEnergy = energyMap[section.energy] || 0.5;

    for (let i = 0; i < cutsInSection; i++) {
      // Modulate energy using the DNA's energy arc curve
      const positionInArc = (currentTime / targetDuration);
      const arcEnergy = sampleEnergyArc(dna.energy_arc, positionInArc);
      const blendedEnergy = (baseEnergy + arcEnergy) / 2;

      // Insert breathing moments based on DNA breathing pattern
      const isBreathingMoment =
        dna.cut_pattern.has_breathing_moments &&
        dna.cut_pattern.breathing_interval_ms &&
        i > 0 &&
        i % Math.round(dna.cut_pattern.breathing_interval_ms / (clipDuration * 1000)) === 0;

      if (isBreathingMoment) {
        slots.push({
          startTime: currentTime,
          duration: clipDuration * 2, // Breathing = double duration
          targetEnergy: blendedEnergy * 0.5, // Lower energy
          slotType: 'breathing',
        });
        currentTime += clipDuration * 2;
      } else {
        // Select cut type based on DNA vocabulary (weighted random)
        const cutType = selectCutType(dna.cut_pattern.cut_types);

        slots.push({
          startTime: currentTime,
          duration: clipDuration,
          targetEnergy: blendedEnergy,
          slotType: 'content',
          cutType,
        });
        currentTime += clipDuration;
      }

      if (currentTime >= targetDuration) break;
    }
    if (currentTime >= targetDuration) break;
  }

  return slots;
}

function sampleEnergyArc(arc: EnergyArc, position: number): number {
  if (arc.curve.length === 0) return 0.5;
  const idx = Math.min(
    Math.floor(position * arc.curve.length),
    arc.curve.length - 1
  );
  return arc.curve[idx];
}

function selectCutType(cutTypes: CutPattern['cut_types']): string {
  if (cutTypes.length === 0) return 'hard-cut';
  const totalWeight = cutTypes.reduce((s, c) => s + c.weight, 0);
  let random = Math.random() * totalWeight;
  for (const ct of cutTypes) {
    random -= ct.weight;
    if (random <= 0) return ct.type;
  }
  return cutTypes[0].type;
}

// ─── Segment Assignment ─────────────────────────────────────────────────────

interface AssignedSegment extends SourceSegment {
  slot: TimelineSlot;
  outputStart: number;
  outputDuration: number;
}

/**
 * Match source segments to timeline slots based on energy, quality, and content.
 *
 * This is where CLIP embeddings become critical for style matching —
 * we're not just picking random good footage, we're matching the FEEL
 * and content type of each slot to the best available source material.
 */
function assignSegmentsToTimeline(
  segments: SourceSegment[],
  slots: TimelineSlot[],
  cutPattern: CutPattern
): AssignedSegment[] {
  // TODO: Intelligent assignment algorithm
  //
  // For each timeline slot:
  // 1. Filter source segments that are long enough
  // 2. Score each candidate:
  //    - Energy match: how close is segment energy to slot target energy?
  //    - Quality: higher quality = higher score
  //    - Content type fit: hook slots want high-energy, breathing wants calm
  //    - CLIP similarity: if reference had a specific type of shot here,
  //      find semantically similar footage in the source
  //    - Variety penalty: avoid reusing the same segment
  // 3. Pick the best scoring candidate
  // 4. Handle J-cuts and L-cuts: extend audio beyond visual boundaries
  //
  // For beat-sync mode: snap slot boundaries to nearest beat timestamps

  return slots.map((slot) => {
    // Simple placeholder: use first available segment
    const best = segments[0] || {
      startTime: 0,
      endTime: slot.duration,
      qualityScore: 0.5,
      motionLevel: 0.5,
      energyLevel: 0.5,
      brightness: 0.5,
      dominantColors: ['#333'],
      hasText: false,
      hasFace: false,
      contentType: 'b-roll' as const,
    };

    return {
      ...best,
      slot,
      outputStart: slot.startTime,
      outputDuration: slot.duration,
    };
  });
}

// ─── Rhythm Patterns ────────────────────────────────────────────────────────

/**
 * Adjust clip timing to match the DNA's rhythm signature.
 * This is what makes the edit FEEL like the reference — the subtle
 * timing variations that distinguish a metronome from a musician.
 */
function applyRhythmPatterns(
  segments: AssignedSegment[],
  cutPattern: CutPattern
): AssignedSegment[] {
  // TODO: Rhythm adjustment
  //
  // 1. If rhythm_consistency is high (>0.8): keep clips very regular
  // 2. If syncopated: alternate short-long-short-long
  // 3. If accelerating: progressively shorten clips
  // 4. If variable: use the duration_histogram to randomly vary
  //    clip lengths matching the reference's distribution
  //
  // The histogram is key — it captures the PROBABILITY DISTRIBUTION
  // of cut durations from the reference. We sample from this
  // distribution to get cuts that feel natural to the style.
  //
  // Also apply breathing moments: after a rapid-cut sequence,
  // insert a longer hold to let the viewer breathe (if the DNA has them).

  return segments; // Passthrough for now
}

// ─── Clip Building with Transitions ─────────────────────────────────────────

function buildClipsWithTransitions(
  segments: AssignedSegment[],
  dna: StyleDNA
): ShotstackClip[] {
  return segments.map((segment, index) => {
    // Select transition based on DNA vocabulary + context
    const transitionType = selectTransitionForContext(
      dna.transition_preferences,
      segment,
      index,
      segments.length,
      dna.energy_arc
    );

    // Map color profile to Shotstack filter
    const filter = mapColorProfileToFilter(dna.color_profile);

    const clip: ShotstackClip = {
      asset: {
        type: 'video',
        src: '', // TODO: source video URL
        trim: segment.startTime,
        volume: dna.audio_sync_strategy === 'none' ? 1 : 0,
      },
      start: segment.outputStart,
      length: segment.outputDuration,
      transition: transitionType ? { in: transitionType } : undefined,
      filter: filter || undefined,
    };

    return clip;
  });
}

/**
 * Context-aware transition selection.
 * Not just random — transitions vary based on position in the edit,
 * energy level, and what's happening in the content.
 */
function selectTransitionForContext(
  preferences: TransitionPreference[],
  segment: AssignedSegment,
  index: number,
  totalClips: number,
  energyArc: EnergyArc
): string | null {
  if (preferences.length === 0 || index === 0) return null;

  // High energy moments favor hard cuts
  // Low energy moments favor dissolves
  // First/last clips get special treatment
  const position = index / totalClips;
  const energy = sampleEnergyArc(energyArc, position);

  // Bias toward hard cuts at high energy, dissolves at low energy
  const adjustedPrefs = preferences.map((p) => {
    let weight = p.weight;
    if (energy > 0.7 && p.type === 'cut') weight *= 1.5;
    if (energy < 0.3 && p.type === 'dissolve') weight *= 1.5;
    if (segment.slot.slotType === 'breathing' && p.type === 'dissolve') weight *= 2;
    return { ...p, weight };
  });

  // Weighted selection
  const totalWeight = adjustedPrefs.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  for (const pref of adjustedPrefs) {
    random -= pref.weight;
    if (random <= 0) return mapTransitionType(pref.type);
  }

  return null;
}

function mapTransitionType(type: TransitionPreference['type']): string {
  const map: Record<string, string> = {
    cut: '',
    dissolve: 'fade',
    wipe: 'slideLeft',
    zoom: 'zoom',
    whip: 'slideRight',
    glitch: 'fade',  // Shotstack approximation
    none: '',
  };
  return map[type] || '';
}

function mapColorProfileToFilter(profile: ColorProfile): string | null {
  // TODO: More sophisticated color matching
  // Shotstack's built-in filters are limited (boost, contrast, darken, etc.)
  // For real color grading: generate a LUT via FFmpeg and apply in post-render
  // Or use Shotstack's custom CSS filter pipeline if available

  if (profile.contrast > 130) return 'contrast';
  if (profile.brightness < 70) return 'darken';
  if (profile.brightness > 130) return 'lighten';
  if (profile.saturation < 50) return 'greyscale';
  if (profile.saturation > 130) return 'boost';
  return null;
}

// ─── Audio Track Building ───────────────────────────────────────────────────

function buildAudioTrack(
  segments: AssignedSegment[],
  dna: StyleDNA,
  options: MatcherOptions
): ShotstackTrack | undefined {
  if (!options.audioUrl) return undefined;

  const clips: ShotstackClip[] = [];

  // Main audio/music track
  clips.push({
    asset: {
      type: 'audio',
      src: options.audioUrl,
      volume: 1,
      effect: 'fadeInFadeOut',
    },
    start: 0,
    length: options.audioDuration || 30,
  });

  // TODO: Audio relationship application
  //
  // If dna.audio_edit_relationship.music_ducks_under_speech:
  //   - Detect speech segments in source audio
  //   - Add volume keyframes: duck music to ~30% during speech
  //
  // If dna.audio_edit_relationship.sound_effects_on_transitions:
  //   - Add whoosh/riser/impact SFX at major cut points
  //   - Select SFX type based on transition type (whip → whoosh, smash → impact)
  //
  // If dna.audio_edit_relationship.silence_as_punctuation:
  //   - Insert brief silence (200-500ms) before key visual moments
  //
  // J-cut / L-cut handling:
  //   - For J-cuts: extend next clip's audio 500ms-1s before its visual start
  //   - For L-cuts: extend current clip's audio 500ms-1s past its visual end
  //   - Requires splitting audio and video into separate tracks

  return { clips };
}

// ─── Motion Effects ─────────────────────────────────────────────────────────

/**
 * Apply motion techniques from the DNA: speed ramps, zoom punches, etc.
 *
 * These are post-production effects that dramatically change the feel
 * of the edit — a zoom punch on a beat hit, a speed ramp into a reveal.
 */
function applyMotionEffects(
  clips: ShotstackClip[],
  motion: MotionProfile
): ShotstackClip[] {
  // TODO: Motion effects application
  //
  // Speed ramps:
  //   - Can't do true speed ramps in Shotstack (no keyframed speed)
  //   - Workaround: pre-process with FFmpeg speed filter before upload
  //   - Flag clips that need speed ramp preprocessing
  //
  // Zoom punches:
  //   - Use Shotstack scale + offset keyframes (if supported)
  //   - Or: pre-process with FFmpeg zoompan filter
  //   - Place at energy peaks in the timeline
  //   - Frequency from motion.zoom_punch_frequency
  //
  // Parallax (2.5D):
  //   - Requires depth map generation (MiDaS or similar)
  //   - Split into layers, animate independently
  //   - Only applicable to still images or very slow footage
  //
  // For now: return clips unmodified, flag for post-processing

  return clips.map((clip) => {
    // TODO: Add motion effects based on DNA
    return clip;
  });
}

// ─── Text Overlay Track ─────────────────────────────────────────────────────

function buildTextOverlayTrack(
  segments: AssignedSegment[],
  textStyle: TextStyleProfile,
  options: MatcherOptions
): ShotstackTrack | undefined {
  const clips: ShotstackClip[] = [];

  // Add user-provided text overlays styled to match the DNA
  if (options.textOverlays) {
    for (const overlay of options.textOverlays) {
      clips.push({
        asset: {
          type: 'title',
          text: overlay.text,
          style: `font-family: ${textStyle.font_family}; color: ${textStyle.text_color}; font-weight: ${textStyle.font_weight};`,
        },
        start: overlay.timestamp,
        length: overlay.duration,
        position: textStyle.position === 'lower-third' ? 'bottom' : textStyle.position,
        transition: textStyle.animation !== 'none'
          ? { in: mapTextAnimation(textStyle.animation) }
          : undefined,
      });
    }
  }

  // Add hook text if DNA has cold open
  if (options.hookText) {
    clips.push({
      asset: {
        type: 'title',
        text: options.hookText,
        style: `font-family: ${textStyle.font_family}; color: ${textStyle.text_color}; font-weight: bold;`,
      },
      start: 0,
      length: 2,
      position: 'center',
      transition: { in: 'fade' },
    });
  }

  // Add CTA text if DNA has outro CTA
  if (options.ctaText && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    clips.push({
      asset: {
        type: 'title',
        text: options.ctaText,
        style: `font-family: ${textStyle.font_family}; color: ${textStyle.text_color};`,
      },
      start: lastSegment.outputStart + lastSegment.outputDuration - 3,
      length: 3,
      position: 'center',
      transition: { in: 'fade', out: 'fade' },
    });
  }

  return clips.length > 0 ? { clips } : undefined;
}

function mapTextAnimation(animation: TextStyleProfile['animation']): string {
  const map: Record<string, string> = {
    fade: 'fade',
    slide: 'slideUp',
    typewriter: 'fade', // Shotstack approximation
    glitch: 'fade',     // Shotstack approximation
    none: '',
  };
  return map[animation] || '';
}

// ─── Narrative Structure ────────────────────────────────────────────────────

/**
 * Apply narrative structure from the DNA.
 * Reorder and frame clips to match the storytelling pattern.
 */
function applyNarrativeStructure(
  clips: ShotstackClip[],
  narrative: NarrativeStructure,
  source: SourceAnalysis
): ShotstackClip[] {
  if (clips.length < 3) return clips;

  // TODO: Narrative reordering
  //
  // Cold open / hook:
  //   If narrative.has_hook, pull the most visually striking clip to position 0
  //   and trim it to narrative.hook_duration_ms
  //
  // Intro sequence:
  //   If narrative.has_intro_sequence, insert a branded intro card after hook
  //
  // Storytelling style:
  //   - 'linear': keep chronological order
  //   - 'nonlinear': reorder for tension (tease ending, then flashback)
  //   - 'montage': pure visual flow, ordered by energy
  //   - 'documentary': talking heads + B-roll interleaving
  //   - 'vlog': talking → action → talking → reaction pattern
  //   - 'cinematic': slow build, long shots, dramatic beats
  //
  // Outro CTA:
  //   If narrative.has_outro_cta, ensure last 2-3 seconds allow for text overlay

  return clips;
}

// ─── Beat Sync ──────────────────────────────────────────────────────────────

/**
 * Snap all cut points to the nearest audio beat.
 * This transforms a mechanically-timed edit into one that FEELS musical.
 *
 * Algorithm:
 * 1. For each clip boundary, find the nearest beat timestamp
 * 2. If the nearest beat is within a tolerance window (±200ms), snap to it
 * 3. Adjust clip durations accordingly (stretch/compress ±200ms)
 * 4. For bass_drop_sync: find major visual transitions and align to bass hits
 */
export function syncToBeats(
  clips: ShotstackClip[],
  beatTimestamps: number[],
  toleranceMs: number = 200
): ShotstackClip[] {
  if (beatTimestamps.length === 0) return clips;

  const toleranceSec = toleranceMs / 1000;

  return clips.map((clip, index) => {
    if (index === 0) return clip; // Don't move the first clip

    const clipStart = clip.start;
    // Find nearest beat
    const nearestBeat = beatTimestamps.reduce((best, beat) =>
      Math.abs(beat - clipStart) < Math.abs(best - clipStart) ? beat : best
    );

    const distance = Math.abs(nearestBeat - clipStart);
    if (distance <= toleranceSec) {
      // Snap to beat — adjust this clip's start and previous clip's length
      const adjustment = nearestBeat - clipStart;
      return {
        ...clip,
        start: nearestBeat,
        length: clip.length - adjustment, // Compensate duration
      };
    }

    return clip;
  });
}

// ─── Style DNA Comparison ───────────────────────────────────────────────────

/**
 * Compare two Style DNA profiles and return a similarity score.
 * Useful for finding similar styles in the marketplace, or verifying
 * that an applied style matches the reference.
 */
export function compareStyleDNA(a: StyleDNA, b: StyleDNA): {
  overall: number;
  rhythm: number;
  color: number;
  pacing: number;
  transitions: number;
} {
  const rhythmSim = 1 - Math.abs(
    a.cut_pattern.avg_cut_duration_ms - b.cut_pattern.avg_cut_duration_ms
  ) / Math.max(a.cut_pattern.avg_cut_duration_ms, b.cut_pattern.avg_cut_duration_ms);

  const colorSim = 1 - (
    Math.abs(a.color_profile.temperature - b.color_profile.temperature) / 200 +
    Math.abs(a.color_profile.saturation - b.color_profile.saturation) / 200 +
    Math.abs(a.color_profile.contrast - b.color_profile.contrast) / 200
  ) / 3;

  const energyMap = { low: 0.25, medium: 0.5, high: 0.75, extreme: 1.0 };
  const pacingSim = 1 - Math.abs(
    energyMap[a.pacing.overall_energy] - energyMap[b.pacing.overall_energy]
  );

  // Transition preference cosine similarity
  const transTypes = ['cut', 'dissolve', 'wipe', 'zoom', 'whip', 'glitch', 'none'] as const;
  const aWeights = transTypes.map((t) => a.transition_preferences.find((p) => p.type === t)?.weight || 0);
  const bWeights = transTypes.map((t) => b.transition_preferences.find((p) => p.type === t)?.weight || 0);
  const dot = aWeights.reduce((s, v, i) => s + v * bWeights[i], 0);
  const magA = Math.sqrt(aWeights.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(bWeights.reduce((s, v) => s + v * v, 0));
  const transitionSim = magA > 0 && magB > 0 ? dot / (magA * magB) : 0;

  const overall = (rhythmSim * 0.35 + colorSim * 0.15 + pacingSim * 0.3 + transitionSim * 0.2);

  return {
    overall: Math.max(0, Math.min(1, overall)),
    rhythm: Math.max(0, Math.min(1, rhythmSim)),
    color: Math.max(0, Math.min(1, colorSim)),
    pacing: Math.max(0, Math.min(1, pacingSim)),
    transitions: Math.max(0, Math.min(1, transitionSim)),
  };
}
