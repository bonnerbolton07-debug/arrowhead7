// =============================================================================
// Arrowhead 7 — Reference soundtrack generation
// =============================================================================
// Two responsibilities:
//   1. Analyse a reference music track (BPM, energy curve, mood) by reusing the
//      audio analyser. The output drives prompt construction for the music
//      generator.
//   2. Call an AI music generator (Mubert or SOUNDRAW) to produce an original,
//      copyright-clean track that matches the reference's vibe.
//
// Both providers are gated on env vars. When neither is configured we return a
// `placeholder` result the editor can render (the matcher omits the audio track
// in that case) so the rest of the pipeline still works end-to-end in dev.

import { analyzeAudio, type AudioFeatures } from './audio';
import { extractMetadata } from './probe';
import { resolveSource } from './source';
import { isFfmpegAvailable, unlinkQuiet } from './ffmpeg-runner';

export interface SoundtrackPrompt {
  bpm: number;
  duration_seconds: number;
  mood: 'energetic' | 'driving' | 'cinematic' | 'chill' | 'melancholic' | 'punchy' | 'ambient';
  genre_hints: string[];
  energy_shape: 'flat' | 'build' | 'wave' | 'front-loaded' | 'peak-valley';
  spectral_balance: { low: number; mid: number; high: number };
  /** Free-form prompt suitable for a text-to-music model. */
  text_prompt: string;
}

export interface SoundtrackResult {
  url: string | null;
  duration_seconds: number;
  bpm: number;
  beats: number[];
  /** Which backend produced this — `placeholder` means none of the integrations were configured. */
  provider: 'mubert' | 'soundraw' | 'placeholder';
  prompt: SoundtrackPrompt;
  /** Provider-specific request id, when available. */
  job_id?: string;
}

// ─── Reference analysis ─────────────────────────────────────────────────────

export async function analyseReferenceSoundtrack(reference: string): Promise<{
  features: AudioFeatures;
  prompt: SoundtrackPrompt;
}> {
  if (!(await isFfmpegAvailable())) {
    const fallback: AudioFeatures = {
      sample_rate: 22050,
      duration_seconds: 30,
      has_audio: true,
      bpm: 120,
      bpm_confidence: 0.3,
      beats: [],
      energy_curve: new Array(30).fill(0.6),
      silence_segments: [],
      has_music: true,
      has_speech: false,
      speech_segments: [],
      rms_mean: 0.12,
      rms_peak: 0.5,
      spectral_balance: { low: 0.4, mid: 0.4, high: 0.2 },
    };
    return { features: fallback, prompt: buildPrompt(fallback) };
  }

  const resolved = await resolveSource(reference);
  try {
    const meta = await extractMetadata(resolved.path);
    const features = await analyzeAudio(resolved.path, meta.has_audio);
    return { features, prompt: buildPrompt(features) };
  } finally {
    if (resolved.ephemeral) await unlinkQuiet(resolved.path);
  }
}

function buildPrompt(features: AudioFeatures): SoundtrackPrompt {
  const bpm = Math.max(60, Math.min(180, Math.round(features.bpm ?? 110)));
  const balance = features.spectral_balance;
  const arc = inferShape(features.energy_curve);
  const mood = inferMood(bpm, balance, features.rms_mean);
  const genres = inferGenres(bpm, balance, mood);
  const text = [
    `Original instrumental track at ${bpm} BPM`,
    `mood: ${mood}`,
    genres.length > 0 ? `style: ${genres.join(', ')}` : null,
    `energy: ${arc}`,
    `low/mid/high balance: ${balance.low.toFixed(2)}/${balance.mid.toFixed(2)}/${balance.high.toFixed(2)}`,
    'no copyrighted melodies, no vocals',
  ].filter(Boolean).join('. ');

  return {
    bpm,
    duration_seconds: Math.max(15, Math.round(features.duration_seconds || 30)),
    mood,
    genre_hints: genres,
    energy_shape: arc,
    spectral_balance: balance,
    text_prompt: text,
  };
}

function inferShape(curve: number[]): SoundtrackPrompt['energy_shape'] {
  if (curve.length < 4) return 'flat';
  const head = avg(curve.slice(0, Math.floor(curve.length / 3)));
  const tail = avg(curve.slice(-Math.floor(curve.length / 3)));
  if (tail > head * 1.3) return 'build';
  if (head > tail * 1.3) return 'front-loaded';
  // wave detection — count slope reversals
  let prev = 0;
  let reversals = 0;
  for (let i = 1; i < curve.length; i++) {
    const slope = curve[i] - curve[i - 1];
    const dir = slope > 0.04 ? 1 : slope < -0.04 ? -1 : prev;
    if (prev !== 0 && dir !== 0 && dir !== prev) reversals++;
    prev = dir || prev;
  }
  if (reversals >= 3) return 'wave';
  const peakIdx = curve.indexOf(Math.max(...curve));
  const peakPos = peakIdx / curve.length;
  if (peakPos > 0.3 && peakPos < 0.7) return 'peak-valley';
  return 'flat';
}

function inferMood(
  bpm: number,
  balance: { low: number; mid: number; high: number },
  rms: number
): SoundtrackPrompt['mood'] {
  if (bpm >= 140 && rms > 0.1) return 'energetic';
  if (bpm >= 110 && balance.low > 0.4) return 'driving';
  if (bpm >= 90 && rms > 0.08 && balance.high > 0.3) return 'punchy';
  if (bpm < 90 && balance.low > 0.4) return 'cinematic';
  if (bpm < 80 && rms < 0.07) return 'ambient';
  if (bpm < 100 && balance.mid > 0.4) return 'chill';
  return 'melancholic';
}

function inferGenres(bpm: number, balance: { low: number; mid: number; high: number }, mood: SoundtrackPrompt['mood']): string[] {
  const hints: string[] = [];
  if (mood === 'energetic' || mood === 'driving') hints.push('electronic', 'pop');
  if (mood === 'cinematic') hints.push('orchestral', 'score');
  if (mood === 'punchy') hints.push('hip-hop', 'trap');
  if (mood === 'chill') hints.push('lofi', 'r&b');
  if (mood === 'ambient') hints.push('ambient');
  if (bpm > 150 && balance.high > 0.3) hints.push('drum & bass');
  if (bpm < 100 && balance.low > 0.5) hints.push('downtempo');
  return Array.from(new Set(hints));
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ─── Generation providers ───────────────────────────────────────────────────

/**
 * Generate an original soundtrack matching the reference's fingerprint.
 *
 * Tries Mubert first (if MUBERT_API_KEY is set), then SOUNDRAW (if
 * SOUNDRAW_API_KEY is set). If neither is configured, returns a placeholder.
 */
export async function generateSoundtrack(prompt: SoundtrackPrompt): Promise<SoundtrackResult> {
  if (process.env.MUBERT_API_KEY) {
    try {
      return await generateWithMubert(prompt);
    } catch (err) {
      console.warn('[soundtrack] Mubert generation failed, falling back:', err);
    }
  }
  if (process.env.SOUNDRAW_API_KEY) {
    try {
      return await generateWithSoundraw(prompt);
    } catch (err) {
      console.warn('[soundtrack] SOUNDRAW generation failed, falling back:', err);
    }
  }
  return placeholderResult(prompt);
}

function placeholderResult(prompt: SoundtrackPrompt): SoundtrackResult {
  // Synthetic beat grid so the matcher can still beat-sync if it wants to.
  const beats: number[] = [];
  const period = 60 / prompt.bpm;
  for (let t = 0; t < prompt.duration_seconds; t += period) {
    beats.push(Number(t.toFixed(3)));
  }
  return {
    url: null,
    duration_seconds: prompt.duration_seconds,
    bpm: prompt.bpm,
    beats,
    provider: 'placeholder',
    prompt,
  };
}

interface MubertGenerateResponse {
  status: number;
  data?: {
    task_id?: string;
    url?: string;
    audio?: { url?: string };
  };
  error?: { text?: string };
}

async function generateWithMubert(prompt: SoundtrackPrompt): Promise<SoundtrackResult> {
  const apiKey = process.env.MUBERT_API_KEY!;
  const url = process.env.MUBERT_API_URL || 'https://api-b2b.mubert.com/v2/TTMRecordTrack';

  const body = {
    method: 'TTMRecordTrack',
    params: {
      pat: apiKey,
      text: prompt.text_prompt,
      duration: prompt.duration_seconds,
      bpm: prompt.bpm,
      mode: 'track',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Mubert request failed: ${res.status}`);
  }
  const data = (await res.json()) as MubertGenerateResponse;
  const trackUrl = data.data?.url || data.data?.audio?.url || null;
  if (!trackUrl) {
    throw new Error(`Mubert returned no track url: ${data.error?.text ?? 'unknown error'}`);
  }
  const beats: number[] = [];
  const period = 60 / prompt.bpm;
  for (let t = 0; t < prompt.duration_seconds; t += period) beats.push(Number(t.toFixed(3)));
  return {
    url: trackUrl,
    duration_seconds: prompt.duration_seconds,
    bpm: prompt.bpm,
    beats,
    provider: 'mubert',
    prompt,
    job_id: data.data?.task_id,
  };
}

interface SoundrawResponse {
  url?: string;
  preview_url?: string;
  task_id?: string;
}

async function generateWithSoundraw(prompt: SoundtrackPrompt): Promise<SoundtrackResult> {
  const apiKey = process.env.SOUNDRAW_API_KEY!;
  const url = process.env.SOUNDRAW_API_URL || 'https://api.soundraw.io/v1/generate';
  const body = {
    bpm: prompt.bpm,
    mood: prompt.mood,
    genres: prompt.genre_hints,
    duration: prompt.duration_seconds,
    energy: prompt.energy_shape,
    description: prompt.text_prompt,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`SOUNDRAW request failed: ${res.status}`);
  }
  const data = (await res.json()) as SoundrawResponse;
  const trackUrl = data.url || data.preview_url || null;
  if (!trackUrl) throw new Error('SOUNDRAW returned no track url');
  const beats: number[] = [];
  const period = 60 / prompt.bpm;
  for (let t = 0; t < prompt.duration_seconds; t += period) beats.push(Number(t.toFixed(3)));
  return {
    url: trackUrl,
    duration_seconds: prompt.duration_seconds,
    bpm: prompt.bpm,
    beats,
    provider: 'soundraw',
    prompt,
    job_id: data.task_id,
  };
}
