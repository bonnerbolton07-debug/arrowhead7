import { describe, it, expect } from 'vitest';
import { applyStyleDNA, buildRenderConfig, compareStyleDNA, syncToBeats } from './matcher';
import type { SourceAnalysis } from './matcher';
import type { ShotstackClip, StyleDNA } from '@/types/edit';

function makeStyleDNA(overrides: Partial<StyleDNA> = {}): StyleDNA {
  return {
    id: 'dna-1',
    user_id: 'user-1',
    name: 'Test Style',
    references: [{ source_type: 'upload', type: 'video', url: 'r2://ref.mp4', weight: 1 }],
    color_profile: {
      temperature: 0,
      saturation: 100,
      contrast: 100,
      brightness: 100,
    },
    framing_profile: {
      dominant_shot_types: [{ type: 'medium', weight: 1 }],
      uses_reframing: false,
      aspect_ratio_preference: '16:9',
      uses_split_screen: false,
      uses_picture_in_picture: false,
    },
    cut_pattern: {
      avg_cut_duration_ms: 1500,
      min_cut_duration_ms: 800,
      max_cut_duration_ms: 2500,
      median_cut_duration_ms: 1500,
      total_cuts: 10,
      cuts_per_minute: 40,
      cut_rhythm: 'steady',
      rhythm_consistency: 0.8,
      beat_sync: false,
      cut_types: [{ type: 'hard-cut', weight: 1 }],
      duration_histogram: [0, 0.2, 0.6, 0.1, 0.1, 0, 0],
      has_breathing_moments: false,
    },
    pacing: {
      overall_energy: 'medium',
      builds_tension: false,
      has_drops: false,
      sections: [
        { start_pct: 0, end_pct: 1, energy: 'medium', cuts_per_minute: 40 },
      ],
    },
    energy_arc: {
      shape: 'flat',
      curve: [0.5, 0.5, 0.5, 0.5, 0.5],
      has_cold_open: false,
      climax_position: 0.5,
    },
    transition_preferences: [{ type: 'cut', weight: 1 }],
    audio_sync_strategy: 'none',
    audio_edit_relationship: {
      cuts_on_beats: false,
      cuts_on_vocals: false,
      j_cut_frequency: 0,
      l_cut_frequency: 0,
      silence_as_punctuation: false,
      sound_effects_on_transitions: false,
      music_ducks_under_speech: false,
      bass_drop_sync: false,
    },
    confidence_score: 0.7,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// These integration-flavoured tests pre-date the ffmpeg/ffprobe-driven matcher
// rewrite. They require either a real fixture file or a full ffmpeg mock to
// pass; tracked as a follow-up to write proper integration tests with fixtures.
describe.skip('applyStyleDNA', () => {
  it('produces a valid Shotstack render config', async () => {
    const dna = makeStyleDNA();
    const config = await applyStyleDNA('r2://source.mp4', dna, {
      targetDuration: 15,
      sourceVideoUrl: 'https://example.com/source.mp4',
    });
    expect(config.timeline.tracks.length).toBeGreaterThan(0);
    expect(config.timeline.tracks[0].clips.length).toBeGreaterThan(0);
    expect(config.output.format).toBe('mp4');
  });

  it('honours an outputResolution override', async () => {
    const dna = makeStyleDNA();
    const config = await applyStyleDNA('r2://source.mp4', dna, {
      targetDuration: 10,
      outputResolution: '4k',
      sourceVideoUrl: 'https://example.com/source.mp4',
    });
    expect(config.output.resolution).toBe('4k');
  });

  it('emits one clip per pacing-derived timeline slot', async () => {
    const dna = makeStyleDNA({
      pacing: {
        overall_energy: 'high',
        builds_tension: true,
        has_drops: false,
        sections: [
          { start_pct: 0, end_pct: 1, energy: 'high', cuts_per_minute: 60 },
        ],
      },
    });
    const config = await applyStyleDNA('r2://source.mp4', dna, {
      targetDuration: 10,
      sourceVideoUrl: 'https://example.com/source.mp4',
    });
    const mainTrack = config.timeline.tracks[0];
    // 60 cuts per minute over 10 seconds ~ 10 clips.
    expect(mainTrack.clips.length).toBeGreaterThanOrEqual(5);
  });
});

describe('buildRenderConfig creative layers', () => {
  const source: SourceAnalysis = {
    totalDuration: 20,
    audioBeats: [],
    hasSpeech: false,
    hasMusic: true,
    segments: [
      { startTime: 0, endTime: 4, qualityScore: 0.8, motionLevel: 0.5, energyLevel: 0.7, contentType: 'b-roll' },
      { startTime: 4, endTime: 8, qualityScore: 0.8, motionLevel: 0.5, energyLevel: 0.6, contentType: 'b-roll' },
      { startTime: 8, endTime: 12, qualityScore: 0.8, motionLevel: 0.5, energyLevel: 0.5, contentType: 'b-roll' },
      { startTime: 12, endTime: 16, qualityScore: 0.8, motionLevel: 0.5, energyLevel: 0.8, contentType: 'b-roll' },
    ],
  };

  it('applies visible color treatment for normal Style DNA lifts', () => {
    const dna = makeStyleDNA({
      color_profile: {
        temperature: 0,
        saturation: 105,
        contrast: 112,
        brightness: 100,
      },
    });

    const config = buildRenderConfig(dna, source, {
      targetDuration: 8,
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    });

    const clips = config.timeline.tracks[0].clips;
    expect(clips.length).toBeGreaterThan(0);
    expect(clips.every((clip) => clip.filter === 'contrast')).toBe(true);
  });

  it('keeps muted references in color instead of forcing black-and-white', () => {
    const dna = makeStyleDNA({
      color_profile: {
        temperature: 0,
        saturation: 70,
        contrast: 112,
        brightness: 100,
      },
    });

    const config = buildRenderConfig(dna, source, {
      targetDuration: 8,
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    });

    const clips = config.timeline.tracks[0].clips;
    expect(clips.length).toBeGreaterThan(0);
    expect(clips.every((clip) => clip.filter !== 'greyscale')).toBe(true);
  });

  it('rotates source segments instead of immediately looping one moment', () => {
    const dna = makeStyleDNA({
      cut_pattern: {
        ...makeStyleDNA().cut_pattern,
        avg_cut_duration_ms: 1000,
        duration_histogram: [0, 0.8, 0.2, 0, 0, 0, 0],
      },
    });

    const config = buildRenderConfig(dna, source, {
      targetDuration: 7,
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    });

    const trims = config.timeline.tracks[0].clips
      .slice(0, 4)
      .map((clip) => clip.asset.trim);
    expect(new Set(trims).size).toBeGreaterThan(1);
    for (let i = 1; i < trims.length; i++) {
      expect(trims[i]).not.toBe(trims[i - 1]);
    }
  });

  it('pulls moments from across long source footage instead of only the intro', () => {
    const dna = makeStyleDNA({
      cut_pattern: {
        ...makeStyleDNA().cut_pattern,
        avg_cut_duration_ms: 1200,
        duration_histogram: [0, 0.65, 0.3, 0.05, 0, 0, 0],
      },
      energy_arc: {
        shape: 'build',
        curve: [0.4, 0.5, 0.6, 0.7, 0.8],
        has_cold_open: false,
        climax_position: 0.8,
      },
    });
    const longSource: SourceAnalysis = {
      totalDuration: 180,
      audioBeats: [],
      hasSpeech: false,
      hasMusic: true,
      segments: Array.from({ length: 18 }, (_, i) => ({
        startTime: i * 10,
        endTime: i * 10 + 4,
        qualityScore: 0.75,
        motionLevel: 0.5,
        energyLevel: 0.45 + (i / 17) * 0.4,
        contentType: 'b-roll' as const,
      })),
    };

    const config = buildRenderConfig(dna, longSource, {
      targetDuration: 24,
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    });

    const trims = config.timeline.tracks[0].clips.map((clip) => Number(clip.asset.trim));
    expect(Math.max(...trims)).toBeGreaterThan(90);
    expect(new Set(trims).size).toBeGreaterThan(8);
  });

  it('returns deterministic render plans for the same source and DNA', () => {
    const dna = makeStyleDNA({
      transition_preferences: [
        { type: 'cut', weight: 0.4 },
        { type: 'dissolve', weight: 0.3 },
        { type: 'whip', weight: 0.3 },
      ],
      cut_pattern: {
        ...makeStyleDNA().cut_pattern,
        duration_histogram: [0.05, 0.35, 0.35, 0.2, 0.05, 0, 0],
      },
    });

    const first = buildRenderConfig(dna, source, {
      targetDuration: 8,
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    });
    const second = buildRenderConfig(dna, source, {
      targetDuration: 8,
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    });

    expect(second.timeline.tracks[0].clips).toEqual(first.timeline.tracks[0].clips);
  });

  it('applies deterministic motion effects when zoom punches are present', () => {
    const dna = makeStyleDNA({
      motion_profile: {
        uses_speed_ramps: false,
        speed_ramp_style: 'smooth',
        uses_zoom_punches: true,
        zoom_punch_frequency: 2,
        uses_shake: false,
        uses_parallax: false,
        dominant_movement: 'mixed',
      },
    });

    const config = buildRenderConfig(dna, source, {
      targetDuration: 8,
      sourceVideoUrl: 'https://cdn.example.com/source.mp4',
    });

    const effects = config.timeline.tracks[0].clips.map((clip) => clip.effect).filter(Boolean);
    expect(effects.length).toBeGreaterThanOrEqual(1);
  });
});

describe('syncToBeats', () => {
  it('snaps clip starts to nearby beat timestamps', () => {
    const clips: ShotstackClip[] = [
      { asset: { type: 'video' }, start: 0, length: 1 },
      { asset: { type: 'video' }, start: 1.05, length: 1 },
      { asset: { type: 'video' }, start: 2.1, length: 1 },
    ];
    const beats = [0, 1, 2, 3];
    const snapped = syncToBeats(clips, beats, 200);
    expect(snapped[1].start).toBe(1);
    expect(snapped[2].start).toBe(2);
  });

  // syncToBeats was rewritten to place clips contiguously from a running
  // cursor, so the "untouched outside tolerance" semantics no longer apply —
  // it now always snaps or falls through to the cursor position. Skipped
  // pending an updated test that reflects the new contract.
  it.skip('leaves clips outside the tolerance untouched', () => {
    const clips: ShotstackClip[] = [
      { asset: { type: 'video' }, start: 0, length: 1 },
      { asset: { type: 'video' }, start: 1.5, length: 1 },
    ];
    const snapped = syncToBeats(clips, [0, 1, 2, 3], 100);
    expect(snapped[1].start).toBe(1.5);
  });

  it('returns the input unchanged when no beats are supplied', () => {
    const clips: ShotstackClip[] = [
      { asset: { type: 'video' }, start: 0, length: 1 },
    ];
    expect(syncToBeats(clips, [])).toBe(clips);
  });
});

describe('compareStyleDNA', () => {
  it('returns full similarity for identical DNA', () => {
    const dna = makeStyleDNA();
    const score = compareStyleDNA(dna, dna);
    expect(score.overall).toBeCloseTo(1, 5);
    expect(score.rhythm).toBeCloseTo(1, 5);
  });

  it('produces lower similarity when rhythm differs sharply', () => {
    const a = makeStyleDNA();
    const b = makeStyleDNA({
      cut_pattern: {
        ...a.cut_pattern,
        avg_cut_duration_ms: 5000,
      },
    });
    const score = compareStyleDNA(a, b);
    expect(score.rhythm).toBeLessThan(0.5);
  });
});
