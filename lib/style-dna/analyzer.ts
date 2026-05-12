// =============================================================================
// Arrowhead 7 — Style DNA Analyzer
// =============================================================================
// Analyzes reference video(s) to extract their complete editing "DNA" —
// not just color grading or shot matching, but the FULL editing language:
// cut rhythm, transition vocabulary, pacing curves, energy arcs, audio-visual
// sync patterns, motion techniques, and narrative structure.
//
// Users can provide:
// - Uploaded video files (stored in R2)
// - Social media URLs (IG reels, TikTok, YouTube, X)
// - Multiple references to blend into a composite style
//
// This is the core differentiator of Arrowhead 7.

import type {
  StyleDNA,
  StyleReference,
  CutPattern,
  CutTypeWeight,
  ColorProfile,
  FramingProfile,
  PacingProfile,
  PacingSection,
  EnergyArc,
  TransitionPreference,
  TextStyleProfile,
  AudioSyncStrategy,
  AudioEditRelationship,
  MotionProfile,
  NarrativeStructure,
} from '@/types/edit';

// ─── Main Analysis Pipeline ─────────────────────────────────────────────────

/**
 * Analyze one or more reference videos and extract a composite Style DNA.
 *
 * Full pipeline per reference:
 *  1. Resolve source (download from R2, or fetch from social URL via yt-dlp/instaloader)
 *  2. Extract metadata (FFprobe)
 *  3. Extract frames at scene boundaries + regular intervals
 *  4. Detect ALL cut points and classify cut types (hard, J, L, match, jump, smash)
 *  5. Analyze color grading across scenes (histogram, temperature, LUT fingerprint)
 *  6. Classify framing per shot (wide/medium/closeup/etc.)
 *  7. Detect transition types and durations between every cut
 *  8. Extract audio: BPM, beat map, energy envelope, speech segments
 *  9. Map audio-edit relationship (cuts on beats? J-cuts? silence as punctuation?)
 * 10. Analyze pacing sections and overall energy arc
 * 11. Detect motion techniques (speed ramps, zoom punches, parallax, shake)
 * 12. Detect text overlays, styling, and animation patterns
 * 13. Determine narrative structure (hook, intro, segments, outro, CTA)
 * 14. Score confidence and compile into StyleDNA profile
 *
 * For multiple references: analyze each independently, then blend weighted by
 * StyleReference.weight into a composite DNA.
 */
export async function analyzeReferenceVideos(
  references: Array<{ url: string; platform?: string; weight?: number }>,
  userId: string
): Promise<Omit<StyleDNA, 'id' | 'created_at' | 'updated_at'>> {
  // Build StyleReference objects
  const styleRefs: StyleReference[] = references.map((ref) => ({
    source_type: ref.platform ? 'url' as const : 'upload' as const,
    url: ref.url,
    platform: ref.platform as StyleReference['platform'],
    weight: ref.weight ?? (1 / references.length),
  }));

  // Analyze each reference independently
  const analyses = await Promise.all(
    styleRefs.map((ref) => analyzeSingleReference(ref))
  );

  // Blend into composite DNA (weighted by each reference's weight)
  const composite = blendAnalyses(analyses, styleRefs);

  return {
    user_id: userId,
    name: 'Untitled Style',
    references: styleRefs,
    confidence_score: composite.confidence,
    ...composite.dna,
  };
}

/**
 * Single-reference convenience wrapper (backward compatible).
 */
export async function analyzeReferenceVideo(
  videoUrl: string,
  userId: string
): Promise<Omit<StyleDNA, 'id' | 'created_at' | 'updated_at'>> {
  return analyzeReferenceVideos([{ url: videoUrl }], userId);
}

// ─── Single Reference Analysis ──────────────────────────────────────────────

interface SingleAnalysisResult {
  metadata: VideoMetadata;
  cutPattern: CutPattern;
  colorProfile: ColorProfile;
  framingProfile: FramingProfile;
  pacing: PacingProfile;
  energyArc: EnergyArc;
  transitions: TransitionPreference[];
  audioSync: AudioSyncStrategy;
  audioEditRelationship: AudioEditRelationship;
  motionProfile: MotionProfile;
  textStyle?: TextStyleProfile;
  narrativeStructure: NarrativeStructure;
  confidence: number;
}

async function analyzeSingleReference(ref: StyleReference): Promise<SingleAnalysisResult> {
  // Step 1: Resolve to local/accessible video
  const videoUrl = await resolveVideoSource(ref);

  // Step 2: Extract metadata
  const metadata = await extractVideoMetadata(videoUrl);

  // Step 3: Detect all scene changes with classifications
  const sceneAnalysis = await detectSceneChangesWithTypes(videoUrl);

  // Step 4: Analyze cut patterns (rhythm, types, timing, breathing)
  const cutPattern = analyzeCutPattern(sceneAnalysis, metadata.duration);

  // Step 5: Analyze color profile
  const colorProfile = await analyzeColorProfile(videoUrl, sceneAnalysis.timestamps);

  // Step 6: Analyze framing per shot
  const framingProfile = await analyzeFraming(videoUrl, sceneAnalysis.timestamps);

  // Step 7: Analyze audio
  const audioAnalysis = await analyzeAudio(videoUrl);

  // Step 8: Map audio-edit relationship
  const audioEditRelationship = analyzeAudioEditRelationship(
    sceneAnalysis, audioAnalysis
  );

  // Step 9: Determine audio sync strategy
  const audioSync = determineAudioSyncStrategy(cutPattern, audioAnalysis);

  // Step 10: Determine pacing sections and energy arc
  const pacing = determinePacing(cutPattern, audioAnalysis, metadata.duration);
  const energyArc = determineEnergyArc(cutPattern, audioAnalysis, metadata.duration);

  // Step 11: Detect transitions
  const transitions = await detectTransitions(videoUrl, sceneAnalysis);

  // Step 12: Detect motion techniques
  const motionProfile = await detectMotionProfile(videoUrl, sceneAnalysis.timestamps);

  // Step 13: Detect text styles
  const textStyle = await detectTextStyle(videoUrl);

  // Step 14: Determine narrative structure
  const narrativeStructure = await analyzeNarrativeStructure(
    videoUrl, sceneAnalysis, audioAnalysis, metadata.duration
  );

  // Step 15: Score confidence
  const confidence = scoreConfidence(metadata, sceneAnalysis, audioAnalysis);

  return {
    metadata,
    cutPattern,
    colorProfile,
    framingProfile,
    pacing,
    energyArc,
    transitions,
    audioSync,
    audioEditRelationship,
    motionProfile,
    textStyle,
    narrativeStructure,
    confidence,
  };
}

// ─── Source Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a reference to a playable/analyzable video URL.
 * - Uploads: already in R2, return URL directly
 * - Social URLs: fetch via yt-dlp (YouTube, TikTok, X) or instaloader (IG)
 *   and upload to R2 for processing
 *
 * TODO: Implement social media video fetching
 * - yt-dlp for YouTube, TikTok, X
 * - instaloader or rapid-api for Instagram reels
 * - Upload fetched video to R2 temp bucket
 * - Cache resolved URLs to avoid re-fetching
 */
async function resolveVideoSource(ref: StyleReference): Promise<string> {
  if (ref.source_type === 'upload') {
    return ref.url; // Already in R2
  }

  // TODO: Social media URL resolution
  // Priority platforms:
  // - Instagram Reels (most common reference source for short-form)
  // - TikTok (second most common)
  // - YouTube (long-form references, music videos, film clips)
  // - X/Twitter video posts
  //
  // Use yt-dlp as unified downloader for YouTube/TikTok/X
  // Use instaloader or rapid-api for Instagram
  // Store fetched videos in R2 temp bucket with 24h TTL
  throw new Error(`Social URL resolution not yet implemented for: ${ref.platform}`);
}

// ─── Sub-analyzers ──────────────────────────────────────────────────────────

interface VideoMetadata {
  duration: number;       // seconds
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate?: number;
  has_audio: boolean;
}

async function extractVideoMetadata(_videoUrl: string): Promise<VideoMetadata> {
  // TODO: FFprobe via serverless function
  // ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
  return {
    duration: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    has_audio: true,
  };
}

// ─── Scene Detection ────────────────────────────────────────────────────────

interface SceneAnalysis {
  timestamps: number[];           // Scene change timestamps in seconds
  cutTypes: CutTypeWeight[];      // Classification of each cut
  cutClassifications: Array<{     // Per-cut detail
    timestamp: number;
    type: CutTypeWeight['type'];
    confidence: number;
  }>;
}

async function detectSceneChangesWithTypes(_videoUrl: string): Promise<SceneAnalysis> {
  // TODO: Two-pass scene detection:
  //
  // Pass 1 — FFmpeg scene detection (fast, gets timestamps):
  //   ffmpeg -i input.mp4 -filter:v "select='gt(scene,0.3)',showinfo" -f null -
  //
  // Pass 2 — AI vision classification (slower, classifies each cut):
  //   For each detected cut point, extract 2 frames (before + after)
  //   Send frame pairs to vision model to classify cut type:
  //   - hard-cut: complete scene change, no transition
  //   - j-cut: audio from next scene starts before visual cut
  //   - l-cut: audio from current scene continues into next visual
  //   - match-cut: compositional or movement continuity across cut
  //   - jump-cut: same subject, time skip (common in vlogs/interviews)
  //   - smash-cut: abrupt tonal contrast (quiet→loud, calm→action)
  //   - cross-cut: alternating between parallel scenes
  //   - cutaway: brief insert shot then back to main action
  //
  // For J-cuts and L-cuts: compare audio waveform transition point
  // vs video transition point (requires audio + video alignment analysis)

  return {
    timestamps: [],
    cutTypes: [
      { type: 'hard-cut', weight: 0.5 },
      { type: 'j-cut', weight: 0.2 },
      { type: 'jump-cut', weight: 0.15 },
      { type: 'l-cut', weight: 0.1 },
      { type: 'match-cut', weight: 0.05 },
    ],
    cutClassifications: [],
  };
}

// ─── Cut Pattern Analysis ───────────────────────────────────────────────────

function analyzeCutPattern(scene: SceneAnalysis, totalDuration: number): CutPattern {
  const timestamps = scene.timestamps;

  if (timestamps.length < 2) {
    return {
      avg_cut_duration_ms: totalDuration * 1000,
      min_cut_duration_ms: totalDuration * 1000,
      max_cut_duration_ms: totalDuration * 1000,
      median_cut_duration_ms: totalDuration * 1000,
      total_cuts: 0,
      cuts_per_minute: 0,
      cut_rhythm: 'steady',
      rhythm_consistency: 1,
      beat_sync: false,
      cut_types: scene.cutTypes,
      duration_histogram: [0, 0, 0, 0, 0, 0, 1],
      has_breathing_moments: false,
    };
  }

  // Calculate inter-cut durations
  const durations: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    durations.push((timestamps[i] - timestamps[i - 1]) * 1000);
  }
  durations.sort((a, b) => a - b);

  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const median = durations[Math.floor(durations.length / 2)];
  const totalCuts = timestamps.length - 1;
  const cutsPerMin = totalDuration > 0 ? (totalCuts / totalDuration) * 60 : 0;

  // Duration histogram: [<0.5s, 0.5-1s, 1-2s, 2-3s, 3-5s, 5-10s, 10s+]
  const buckets = [500, 1000, 2000, 3000, 5000, 10000, Infinity];
  const histogram = new Array(buckets.length).fill(0);
  for (const d of durations) {
    const idx = buckets.findIndex((b) => d < b);
    histogram[idx >= 0 ? idx : buckets.length - 1]++;
  }
  // Normalize to percentages
  const histogramNorm = histogram.map((h) => h / durations.length);

  // Rhythm analysis — check if cut timing is accelerating, decelerating, or variable
  const rhythm = analyzeRhythm(durations);

  // Rhythm consistency — coefficient of variation (lower = more consistent)
  const stdDev = Math.sqrt(
    durations.reduce((sum, d) => sum + (d - avg) ** 2, 0) / durations.length
  );
  const cv = avg > 0 ? stdDev / avg : 0;
  const rhythmConsistency = Math.max(0, Math.min(1, 1 - cv));

  // Breathing pattern — detect clusters of rapid cuts separated by longer holds
  const breathingAnalysis = detectBreathingPattern(durations);

  return {
    avg_cut_duration_ms: avg,
    min_cut_duration_ms: durations[0],
    max_cut_duration_ms: durations[durations.length - 1],
    median_cut_duration_ms: median,
    total_cuts: totalCuts,
    cuts_per_minute: cutsPerMin,
    cut_rhythm: rhythm,
    rhythm_consistency: rhythmConsistency,
    beat_sync: false, // TODO: compare with audio beat map
    cut_types: scene.cutTypes,
    duration_histogram: histogramNorm,
    has_breathing_moments: breathingAnalysis.hasBreathing,
    breathing_interval_ms: breathingAnalysis.interval,
  };
}

function analyzeRhythm(
  durations: number[]
): CutPattern['cut_rhythm'] {
  if (durations.length < 4) return 'steady';

  // Split into thirds and compare average duration
  const third = Math.floor(durations.length / 3);
  const firstThird = durations.slice(0, third);
  const lastThird = durations.slice(-third);
  const avgFirst = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const avgLast = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;

  const ratio = avgLast / avgFirst;

  if (ratio < 0.6) return 'accelerating';   // Cuts getting faster
  if (ratio > 1.6) return 'decelerating';   // Cuts getting slower
  // Check for syncopation (alternating fast/slow)
  let alternations = 0;
  const median = durations[Math.floor(durations.length / 2)];
  for (let i = 1; i < durations.length; i++) {
    const prevAbove = durations[i - 1] > median;
    const currAbove = durations[i] > median;
    if (prevAbove !== currAbove) alternations++;
  }
  if (alternations / durations.length > 0.7) return 'syncopated';
  return durations.length > 10 ? 'variable' : 'steady';
}

function detectBreathingPattern(durations: number[]): {
  hasBreathing: boolean;
  interval?: number;
} {
  if (durations.length < 6) return { hasBreathing: false };

  const median = durations[Math.floor(durations.length / 2)];
  const threshold = median * 3; // A "breath" is 3x longer than median cut

  const breathIndices: number[] = [];
  for (let i = 0; i < durations.length; i++) {
    if (durations[i] > threshold) breathIndices.push(i);
  }

  if (breathIndices.length < 2) return { hasBreathing: false };

  // Calculate average interval between breathing moments
  const intervals: number[] = [];
  for (let i = 1; i < breathIndices.length; i++) {
    intervals.push(breathIndices[i] - breathIndices[i - 1]);
  }
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  // Convert from "number of cuts" to approximate ms
  const avgCutDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  return {
    hasBreathing: true,
    interval: avgInterval * avgCutDuration,
  };
}

// ─── Color Profile ──────────────────────────────────────────────────────────

async function analyzeColorProfile(
  _videoUrl: string,
  _sceneTimestamps: number[]
): Promise<ColorProfile> {
  // TODO: Multi-frame color analysis
  // 1. Extract frames at each scene boundary + mid-scene
  // 2. For each frame: compute histogram, dominant colors, white balance
  // 3. Average across all frames for global profile
  // 4. Compare against known LUT libraries (Colourlab AI-style matching)
  // 5. Extract: temperature, saturation, contrast, brightness, lift/gamma/gain
  return {
    temperature: 0,
    saturation: 100,
    contrast: 100,
    brightness: 100,
  };
}

// ─── Framing Analysis ───────────────────────────────────────────────────────

async function analyzeFraming(
  _videoUrl: string,
  _sceneTimestamps: number[]
): Promise<FramingProfile> {
  // TODO: Per-shot framing classification via AI vision
  // 1. Extract one frame per shot (scene)
  // 2. Classify each: wide / medium / closeup / extreme-closeup / overhead / POV
  // 3. Detect reframing (zoom/pan on static shots)
  // 4. Detect split-screen and PiP usage
  // 5. Determine dominant aspect ratio preference
  return {
    dominant_shot_types: [
      { type: 'medium', weight: 0.5 },
      { type: 'closeup', weight: 0.3 },
      { type: 'wide', weight: 0.2 },
    ],
    uses_reframing: false,
    aspect_ratio_preference: '16:9',
    uses_split_screen: false,
    uses_picture_in_picture: false,
  };
}

// ─── Audio Analysis ─────────────────────────────────────────────────────────

interface AudioAnalysis {
  bpm: number | null;
  beats: number[];                // Beat timestamps in seconds
  hasMusic: boolean;
  hasSpeech: boolean;
  speechSegments: Array<{ start: number; end: number }>;
  energyCurve: number[];          // Normalized 0-1 energy over time
  silenceSegments: Array<{ start: number; end: number }>;
}

async function analyzeAudio(_videoUrl: string): Promise<AudioAnalysis> {
  // TODO: Full audio analysis pipeline
  // 1. Extract audio track: ffmpeg -i input.mp4 -vn -acodec pcm_s16le audio.wav
  // 2. BPM detection: aubio/essentia/librosa
  // 3. Beat tracking: get precise beat timestamps
  // 4. Speech detection: Whisper or VAD (voice activity detection)
  // 5. Energy envelope: RMS energy over sliding window
  // 6. Silence detection: identify intentional pauses
  // 7. Music vs speech classification: determine audio layers
  return {
    bpm: null,
    beats: [],
    hasMusic: false,
    hasSpeech: false,
    speechSegments: [],
    energyCurve: [],
    silenceSegments: [],
  };
}

// ─── Audio-Edit Relationship ────────────────────────────────────────────────

function analyzeAudioEditRelationship(
  scene: SceneAnalysis,
  audio: AudioAnalysis
): AudioEditRelationship {
  // TODO: Cross-reference cut timestamps with audio events
  //
  // cuts_on_beats: For each cut, find nearest beat. If >70% of cuts are within
  //   50ms of a beat, cuts_on_beats = true
  //
  // cuts_on_vocals: For each cut, check if it falls at a speech emphasis point
  //   (word boundary, sentence start, vocal onset)
  //
  // j_cut / l_cut detection: Compare audio transition point vs video transition
  //   point. If audio changes before video → J-cut. After → L-cut.
  //   Already partially detected in scene analysis, aggregate here.
  //
  // silence_as_punctuation: Check if silence segments (>500ms) precede dramatic
  //   visual moments (big transitions, title cards, key reveals)
  //
  // bass_drop_sync: Find bass frequency spikes and check if major visual
  //   transitions align within 100ms

  const cutsOnBeats = audio.beats.length > 0
    ? scene.timestamps.filter((t) =>
        audio.beats.some((b) => Math.abs(b - t) < 0.05)
      ).length / scene.timestamps.length
    : 0;

  return {
    cuts_on_beats: cutsOnBeats > 0.7,
    cuts_on_vocals: false,        // TODO: implement
    j_cut_frequency: 0,           // TODO: from scene.cutClassifications
    l_cut_frequency: 0,           // TODO: from scene.cutClassifications
    silence_as_punctuation: false, // TODO: cross-ref silence with visual beats
    sound_effects_on_transitions: false, // TODO: detect whooshes, risers, impacts
    music_ducks_under_speech: false,     // TODO: compare music energy during speech
    bass_drop_sync: false,               // TODO: detect bass drops + visual alignment
  };
}

// ─── Audio Sync Strategy ────────────────────────────────────────────────────

function determineAudioSyncStrategy(
  cutPattern: CutPattern,
  audioAnalysis: AudioAnalysis
): AudioSyncStrategy {
  if (cutPattern.beat_sync && audioAnalysis.bpm) return 'beat-sync';
  if (audioAnalysis.bpm && audioAnalysis.hasMusic) return 'energy-match';
  return 'none';
}

// ─── Pacing & Energy Arc ────────────────────────────────────────────────────

function determinePacing(
  cutPattern: CutPattern,
  audioAnalysis: AudioAnalysis,
  totalDuration: number
): PacingProfile {
  const avgCutSec = cutPattern.avg_cut_duration_ms / 1000;

  let energy: PacingProfile['overall_energy'] = 'medium';
  if (avgCutSec < 1) energy = 'extreme';
  else if (avgCutSec < 2) energy = 'high';
  else if (avgCutSec < 4) energy = 'medium';
  else energy = 'low';

  // TODO: Build per-section pacing by windowing the cut timestamps
  // Divide video into ~10-second windows, calculate cuts_per_minute in each
  const sections: PacingSection[] = [];
  if (totalDuration > 0) {
    const windowSec = Math.max(5, totalDuration / 5);
    // TODO: populate sections from actual cut data
    sections.push({
      start_pct: 0,
      end_pct: 1,
      energy,
      cuts_per_minute: cutPattern.cuts_per_minute,
      description: 'full video (section analysis pending)',
    });
  }

  return {
    overall_energy: energy,
    bpm_target: audioAnalysis.bpm ?? undefined,
    builds_tension: cutPattern.cut_rhythm === 'accelerating',
    has_drops: false, // TODO: detect from audio analysis
    sections,
  };
}

function determineEnergyArc(
  cutPattern: CutPattern,
  audioAnalysis: AudioAnalysis,
  totalDuration: number
): EnergyArc {
  // TODO: Build energy curve from combined cut density + audio energy
  // 1. Sample 10 evenly-spaced windows across the video
  // 2. In each window: normalized cut density + audio RMS energy
  // 3. Blend into 0-1 energy value per sample point
  // 4. Classify shape: flat, build, peak-valley, slow-burn, front-loaded, wave

  const curve = audioAnalysis.energyCurve.length > 0
    ? audioAnalysis.energyCurve
    : new Array(10).fill(0.5);

  // Find peak
  const maxIdx = curve.indexOf(Math.max(...curve));
  const climaxPosition = curve.length > 0 ? maxIdx / curve.length : 0.5;

  // Detect cold open (high energy in first 10% followed by dip)
  const hasColdOpen = curve.length >= 5 && curve[0] > 0.7 && curve[1] < curve[0] - 0.2;

  // Classify shape
  let shape: EnergyArc['shape'] = 'flat';
  if (curve.length >= 4) {
    const firstQuarter = curve.slice(0, Math.floor(curve.length / 4));
    const lastQuarter = curve.slice(-Math.floor(curve.length / 4));
    const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
    const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;

    if (avgLast > avgFirst * 1.4) shape = 'build';
    else if (avgFirst > avgLast * 1.4) shape = 'front-loaded';
    else if (climaxPosition > 0.3 && climaxPosition < 0.7) shape = 'peak-valley';
    // TODO: detect wave pattern (multiple peaks) and slow-burn
  }

  return {
    shape,
    curve,
    has_cold_open: hasColdOpen,
    climax_position: climaxPosition,
  };
}

// ─── Transition Detection ───────────────────────────────────────────────────

async function detectTransitions(
  _videoUrl: string,
  scene: SceneAnalysis
): Promise<TransitionPreference[]> {
  // TODO: AI vision classification of transitions at each cut point
  // Extract 3-5 frames spanning each cut (1 second window centered on cut)
  // Classify: cut, dissolve, wipe, zoom, whip, glitch
  // Measure transition duration for non-hard-cuts
  return [
    { type: 'cut', weight: 0.7 },
    { type: 'dissolve', weight: 0.15 },
    { type: 'whip', weight: 0.1 },
    { type: 'zoom', weight: 0.05 },
  ];
}

// ─── Motion Profile ─────────────────────────────────────────────────────────

async function detectMotionProfile(
  _videoUrl: string,
  _sceneTimestamps: number[]
): Promise<MotionProfile> {
  // TODO: Motion analysis via optical flow + AI classification
  // 1. Compute optical flow between consecutive frames within each shot
  // 2. Detect speed ramps: sudden velocity changes (playback speed, not camera)
  // 3. Detect zoom punches: post-production scale increases on beat/emphasis
  // 4. Detect shake: high-frequency position jitter (intentional vs stabilized)
  // 5. Detect parallax: 2.5D movement on still images
  // 6. Classify dominant movement: static / handheld / gimbal / drone / mixed
  return {
    uses_speed_ramps: false,
    speed_ramp_style: 'smooth',
    uses_zoom_punches: false,
    zoom_punch_frequency: 0,
    uses_shake: false,
    uses_parallax: false,
    dominant_movement: 'static',
  };
}

// ─── Text Style Detection ───────────────────────────────────────────────────

async function detectTextStyle(
  _videoUrl: string
): Promise<TextStyleProfile | undefined> {
  // TODO: OCR + style extraction via AI vision
  // 1. Extract frames at regular intervals
  // 2. Detect text regions (OCR bounding boxes)
  // 3. For each text region: classify font style, color, background, position
  // 4. Detect animation patterns (fade in, slide, typewriter, glitch)
  // 5. Return dominant text styling pattern
  return undefined;
}

// ─── Narrative Structure ────────────────────────────────────────────────────

async function analyzeNarrativeStructure(
  _videoUrl: string,
  scene: SceneAnalysis,
  audio: AudioAnalysis,
  totalDuration: number
): Promise<NarrativeStructure> {
  // TODO: High-level structural analysis
  // 1. Hook detection: is the first 1-3 seconds designed to stop scrolling?
  //    (high energy, dramatic visual, provocative text, question)
  // 2. Intro detection: branded intro card, channel ident, title sequence
  // 3. Segment detection: topic shifts, visual style changes, B-roll clusters
  // 4. Outro detection: CTA cards, subscribe prompts, end screen
  // 5. Callback detection: visual/audio references to earlier moments
  // 6. Storytelling style classification from overall structure

  return {
    has_hook: false,
    hook_duration_ms: 0,
    has_intro_sequence: false,
    has_outro_cta: false,
    segment_count: 1,
    uses_callbacks: false,
    storytelling_style: 'montage',
  };
}

// ─── Confidence Scoring ─────────────────────────────────────────────────────

function scoreConfidence(
  metadata: VideoMetadata,
  scene: SceneAnalysis,
  audio: AudioAnalysis
): number {
  let score = 0;

  // More cuts = more data = higher confidence
  if (scene.timestamps.length >= 20) score += 0.3;
  else if (scene.timestamps.length >= 10) score += 0.2;
  else if (scene.timestamps.length >= 5) score += 0.1;

  // Longer video = more reliable patterns
  if (metadata.duration >= 120) score += 0.2;
  else if (metadata.duration >= 30) score += 0.1;

  // Audio analysis available
  if (audio.bpm) score += 0.15;
  if (audio.hasSpeech) score += 0.1;
  if (audio.energyCurve.length > 0) score += 0.1;

  // Good resolution = better visual analysis
  if (metadata.width >= 1920) score += 0.1;
  else if (metadata.width >= 1280) score += 0.05;

  // Cut type classification confidence
  if (scene.cutClassifications.length > 0) {
    const avgCutConf =
      scene.cutClassifications.reduce((s, c) => s + c.confidence, 0) /
      scene.cutClassifications.length;
    score += avgCutConf * 0.15;
  }

  return Math.min(1, score);
}

// ─── Multi-Reference Blending ───────────────────────────────────────────────

interface BlendedResult {
  dna: Omit<StyleDNA, 'id' | 'user_id' | 'name' | 'references' | 'confidence_score' | 'created_at' | 'updated_at'>;
  confidence: number;
}

function blendAnalyses(
  analyses: SingleAnalysisResult[],
  refs: StyleReference[]
): BlendedResult {
  if (analyses.length === 1) {
    const a = analyses[0];
    return {
      confidence: a.confidence,
      dna: {
        color_profile: a.colorProfile,
        framing_profile: a.framingProfile,
        cut_pattern: a.cutPattern,
        pacing: a.pacing,
        energy_arc: a.energyArc,
        transition_preferences: a.transitions,
        audio_sync_strategy: a.audioSync,
        audio_edit_relationship: a.audioEditRelationship,
        motion_profile: a.motionProfile,
        text_style: a.textStyle,
        narrative_structure: a.narrativeStructure,
        raw_analysis: { metadata: a.metadata },
      },
    };
  }

  // TODO: Weighted blending of multiple analyses
  // For numeric fields: weighted average
  // For categorical fields: majority vote weighted by reference weight
  // For arrays (like transition preferences): merge and re-weight
  // For energy curves: element-wise weighted average
  //
  // This enables "I want the pacing of Creator A with the color style of Creator B"
  // by adjusting reference weights per-dimension

  // For now, use the highest-weighted reference as primary
  const primaryIdx = refs.reduce(
    (best, ref, idx) => (ref.weight > refs[best].weight ? idx : best),
    0
  );
  const primary = analyses[primaryIdx];

  return {
    confidence: primary.confidence * 0.8, // Lower confidence for unblended multi-ref
    dna: {
      color_profile: primary.colorProfile,
      framing_profile: primary.framingProfile,
      cut_pattern: primary.cutPattern,
      pacing: primary.pacing,
      energy_arc: primary.energyArc,
      transition_preferences: primary.transitions,
      audio_sync_strategy: primary.audioSync,
      audio_edit_relationship: primary.audioEditRelationship,
      motion_profile: primary.motionProfile,
      text_style: primary.textStyle,
      narrative_structure: primary.narrativeStructure,
      raw_analysis: {
        all_references: analyses.map((a) => a.metadata),
        primary_index: primaryIdx,
      },
    },
  };
}
