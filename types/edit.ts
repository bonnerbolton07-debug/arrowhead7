// =============================================================================
// Arrowhead 7 — Core Edit & Rendering Types
// =============================================================================

/** Unique identifiers */
export type EditId = string;
export type UserId = string;
export type RenderJobId = string;
export type StyleDNAId = string;

/** Edit status lifecycle */
export type EditStatus =
  | 'draft'           // User is still configuring
  | 'analyzing'       // Style DNA extraction in progress
  | 'ready'           // Ready to render
  | 'queued'          // In render queue
  | 'rendering'       // Shotstack is processing
  | 'completed'       // Render done, video available
  | 'failed'          // Something broke
  | 'cancelled';      // User cancelled

/** A single edit project */
export interface Edit {
  id: EditId;
  user_id: UserId;
  title: string;
  status: EditStatus;

  // Source material
  source_video_url: string;          // R2 URL of uploaded source
  source_duration_ms: number;
  source_resolution: Resolution;

  // Style DNA reference (optional — user can edit without reference)
  style_dna_id?: StyleDNAId;

  // Reference URLs provided by user (social media links, uploaded videos)
  reference_urls?: string[];

  // Shotstack render config
  render_config?: ShotstackRenderConfig;

  // Output
  output_video_url?: string;         // Cloudflare Stream URL
  output_stream_uid?: string;        // Cloudflare Stream UID
  output_thumbnail_url?: string;

  // Metadata
  credits_used: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

/** Video resolution */
export interface Resolution {
  width: number;
  height: number;
}

/**
 * Style DNA — the complete editing fingerprint extracted from reference video(s).
 *
 * This is NOT just color grading or shot matching. Style DNA captures the full
 * editing LANGUAGE of a creator: how they cut, when they breathe, how they build
 * tension, their transition vocabulary, audio-visual sync patterns, and the
 * energy arc across the entire piece.
 *
 * Reference sources can be:
 * - Uploaded video files
 * - Social media URLs (IG reels, TikTok, YouTube, X)
 * - Multiple references blended into a composite style
 */
export interface StyleDNA {
  id: StyleDNAId;
  user_id: UserId;
  name: string;

  // Reference sources — supports multiple for style blending
  references: StyleReference[];

  // === VISUAL STYLE ===
  color_profile: ColorProfile;
  framing_profile: FramingProfile;

  // === EDITING RHYTHM (the core differentiator) ===
  cut_pattern: CutPattern;
  pacing: PacingProfile;
  energy_arc: EnergyArc;
  transition_preferences: TransitionPreference[];

  // === AUDIO-VISUAL RELATIONSHIP ===
  audio_sync_strategy: AudioSyncStrategy;
  audio_edit_relationship: AudioEditRelationship;

  // === OVERLAYS & MOTION ===
  text_style?: TextStyleProfile;
  motion_profile?: MotionProfile;

  // === NARRATIVE STRUCTURE ===
  narrative_structure?: NarrativeStructure;

  // Raw analysis data from AI
  raw_analysis?: Record<string, unknown>;

  // Composite score — how confident we are in this DNA extraction
  confidence_score: number; // 0-1

  created_at: string;
  updated_at: string;
}

/** A single reference (video OR still image) used to build Style DNA */
export interface StyleReference {
  source_type: 'upload' | 'url';
  /** What kind of media this reference is. Images contribute to color/framing
   *  only; videos drive cut rhythm, pacing, audio, and motion. */
  type: 'video' | 'image';
  url: string;                          // R2 key or social media URL
  platform?: 'instagram' | 'tiktok' | 'youtube' | 'x' | 'other';
  creator_handle?: string;              // @creator if from social
  weight: number;                       // 0-1, how much this reference influences the blend
  analyzed_at?: string;
}

/** How the editor uses camera framing and composition */
export interface FramingProfile {
  dominant_shot_types: ShotTypeWeight[];
  uses_reframing: boolean;              // AI crop / Ken Burns on static shots
  aspect_ratio_preference: string;      // '9:16', '16:9', '1:1', '4:5'
  uses_split_screen: boolean;
  uses_picture_in_picture: boolean;
}

export interface ShotTypeWeight {
  type: 'wide' | 'medium' | 'closeup' | 'extreme-closeup' | 'overhead' | 'pov';
  weight: number; // 0-1
}

/** Energy arc — how the edit's intensity changes over time */
export interface EnergyArc {
  shape: 'flat' | 'build' | 'peak-valley' | 'slow-burn' | 'front-loaded' | 'wave';
  // Normalized energy curve: array of 0-1 values across the video's duration
  // e.g., 10 points = energy sampled at 10%, 20%, ... 100% of duration
  curve: number[];
  has_cold_open: boolean;               // Starts with a hook before intro
  climax_position: number;              // 0-1, where peak energy occurs
}

/** Detailed audio-edit sync relationship */
export interface AudioEditRelationship {
  cuts_on_beats: boolean;               // Hard cuts aligned to musical beats
  cuts_on_vocals: boolean;              // Cuts timed to speech/vocal emphasis
  j_cut_frequency: number;              // 0-1, how often audio leads video
  l_cut_frequency: number;              // 0-1, how often video leads audio
  silence_as_punctuation: boolean;      // Uses silence for dramatic effect
  sound_effects_on_transitions: boolean;
  music_ducks_under_speech: boolean;
  bass_drop_sync: boolean;              // Big visual moments on bass drops
}

/** Camera/clip motion patterns */
export interface MotionProfile {
  uses_speed_ramps: boolean;
  speed_ramp_style: 'smooth' | 'snap' | 'both';
  uses_zoom_punches: boolean;           // Post-production zoom ins for emphasis
  zoom_punch_frequency: number;         // Per minute
  uses_shake: boolean;                  // Intentional camera shake effect
  uses_parallax: boolean;               // 2.5D parallax on stills
  dominant_movement: 'static' | 'handheld' | 'gimbal' | 'drone' | 'mixed';
}

/** How the edit is structured narratively */
export interface NarrativeStructure {
  has_hook: boolean;                    // First 1-3 seconds designed to stop scroll
  hook_duration_ms: number;
  has_intro_sequence: boolean;
  has_outro_cta: boolean;               // Call to action at end
  segment_count: number;                // How many distinct "sections" in the edit
  uses_callbacks: boolean;              // References earlier moments later
  storytelling_style: 'linear' | 'nonlinear' | 'montage' | 'documentary' | 'vlog' | 'cinematic';
}

/** Cut/transition patterns extracted from reference — the editing RHYTHM */
export interface CutPattern {
  // Basic metrics
  avg_cut_duration_ms: number;
  min_cut_duration_ms: number;
  max_cut_duration_ms: number;
  median_cut_duration_ms: number;
  total_cuts: number;
  cuts_per_minute: number;

  // Rhythm analysis
  cut_rhythm: 'steady' | 'accelerating' | 'decelerating' | 'variable' | 'syncopated';
  rhythm_consistency: number;         // 0-1, how regular the timing is (1 = metronome)
  beat_sync: boolean;                 // Cuts align to audio beats

  // Cut type vocabulary
  cut_types: CutTypeWeight[];

  // Timing distribution — histogram of cut durations
  // Buckets: [<0.5s, 0.5-1s, 1-2s, 2-3s, 3-5s, 5-10s, 10s+]
  duration_histogram: number[];

  // Breathing pattern — does the editor use long holds between rapid sequences?
  has_breathing_moments: boolean;
  breathing_interval_ms?: number;     // Avg time between rapid-cut sequences
}

export interface CutTypeWeight {
  type: 'hard-cut' | 'j-cut' | 'l-cut' | 'match-cut' | 'jump-cut' | 'smash-cut' | 'cross-cut' | 'cutaway';
  weight: number; // 0-1
}

/** Color grading profile */
export interface ColorProfile {
  temperature: number;               // -100 (cool) to 100 (warm)
  saturation: number;                // 0-200 (100 = neutral)
  contrast: number;                  // 0-200 (100 = neutral)
  brightness: number;               // 0-200 (100 = neutral)
  lut_reference?: string;           // Optional LUT file reference
}

/** Pacing/energy profile — the tempo and feel of the edit */
export interface PacingProfile {
  overall_energy: 'low' | 'medium' | 'high' | 'extreme';
  bpm_target?: number;
  builds_tension: boolean;
  has_drops: boolean;
  // Per-section pacing (allows variable pace across the edit)
  sections: PacingSection[];
}

export interface PacingSection {
  start_pct: number;                  // 0-1, where this section starts in the timeline
  end_pct: number;
  energy: 'low' | 'medium' | 'high' | 'extreme';
  cuts_per_minute: number;
  description?: string;               // e.g., "slow intro", "rapid montage", "quiet outro"
}

/** Transition type preferences */
export interface TransitionPreference {
  type: 'cut' | 'dissolve' | 'wipe' | 'zoom' | 'whip' | 'glitch' | 'none';
  weight: number;                    // 0-1, how often to use this
  duration_ms?: number;
}

/** Text overlay style */
export interface TextStyleProfile {
  font_family: string;
  font_weight: number;
  text_color: string;
  background_style: 'none' | 'solid' | 'blur' | 'gradient';
  position: 'top' | 'center' | 'bottom' | 'lower-third';
  animation: 'none' | 'fade' | 'slide' | 'typewriter' | 'glitch';
}

/** How to sync edits to audio */
export type AudioSyncStrategy = 'beat-sync' | 'energy-match' | 'manual' | 'none';

/** Shotstack render configuration (maps to their API) */
export interface ShotstackRenderConfig {
  timeline: ShotstackTimeline;
  output: ShotstackOutput;
  merge?: ShotstackMergeField[];
}

/** Simplified Shotstack timeline */
export interface ShotstackTimeline {
  tracks: ShotstackTrack[];
  soundtrack?: {
    src: string;
    effect?: 'fadeIn' | 'fadeOut' | 'fadeInFadeOut';
  };
  background?: string;
}

export interface ShotstackTrack {
  clips: ShotstackClip[];
}

export interface ShotstackClip {
  asset: {
    type: 'video' | 'image' | 'title' | 'audio' | 'html';
    src?: string;
    text?: string;
    trim?: number;
    volume?: number;
    [key: string]: unknown;
  };
  start: number;
  length: number;
  transition?: {
    in?: string;
    out?: string;
  };
  effect?: string;
  filter?: string;
  opacity?: number;
  position?: 'top' | 'center' | 'bottom';
  offset?: { x: number; y: number };
  scale?: number;
}

export interface ShotstackOutput {
  format: 'mp4' | 'gif' | 'jpg' | 'png' | 'bmp' | 'webm';
  resolution: 'sd' | 'hd' | '1080' | '4k';
  fps?: number;
  quality?: 'low' | 'medium' | 'high';
  size?: { width: number; height: number };
}

export interface ShotstackMergeField {
  find: string;
  replace: string | number;
}

/** Render job tracking */
export interface RenderJob {
  id: RenderJobId;
  edit_id: EditId;
  user_id: UserId;

  // Shotstack tracking
  shotstack_render_id?: string;
  shotstack_status?: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';

  // Progress
  progress: number;                  // 0-100
  status: 'pending' | 'processing' | 'uploading' | 'completed' | 'failed';
  error_message?: string;

  // Timing
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

/** Credit transaction */
export interface CreditTransaction {
  id: string;
  user_id: UserId;
  amount: number;                    // Positive = add, negative = spend
  balance_after: number;
  reason: 'render' | 'purchase' | 'subscription' | 'refund' | 'bonus';
  reference_id?: string;            // Edit ID, subscription ID, etc.
  created_at: string;
}
