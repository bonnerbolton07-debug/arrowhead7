// =============================================================================
// Arrowhead 7 — Audio analysis
// =============================================================================
// Pulls a mono 22.05kHz PCM stream out of the source via FFmpeg, then runs:
//   - RMS envelope (energy curve)
//   - Onset detection (positive-energy flux)
//   - BPM estimation (autocorrelation of onset envelope, 60-200 BPM range)
//   - Beat-map grid (BPM + onset phase)
//   - Silence segmentation
//   - Heuristic music vs speech split
//
// This is intentionally implemented in pure JS so we don't depend on aubio /
// essentia / librosa — those would require native bindings that don't fit
// cleanly into the Vercel/Node runtime. Accuracy is good enough for editing
// rhythm matching, which is what the matcher cares about.

import { runFfmpeg } from './ffmpeg-runner';

export interface AudioFeatures {
  sample_rate: number;
  duration_seconds: number;
  has_audio: boolean;
  bpm: number | null;
  bpm_confidence: number;
  beats: number[];
  energy_curve: number[]; // 0..1, ~10Hz
  silence_segments: Array<{ start: number; end: number }>;
  has_music: boolean;
  has_speech: boolean;
  speech_segments: Array<{ start: number; end: number }>;
  rms_mean: number;
  rms_peak: number;
  /** Spectral key fingerprint — average band energies (low/mid/high) */
  spectral_balance: { low: number; mid: number; high: number };
}

const SAMPLE_RATE = 22050;
const HOP_MS = 23; // ~512 samples at 22050Hz
const HOP_SAMPLES = Math.round((SAMPLE_RATE * HOP_MS) / 1000);

/**
 * Decode WAV bytes produced by FFmpeg (-f wav -ac 1 -ar 22050 -acodec pcm_s16le)
 * into a Float32Array in [-1, 1]. The WAV header from FFmpeg piped to stdout
 * uses 0xFFFFFFFF placeholders for the data chunk size, so we trust the
 * remaining bytes after the chunk header rather than the declared length.
 */
function decodePcmWav(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buf.length < 44 || buf.slice(0, 4).toString('ascii') !== 'RIFF') {
    throw new Error('Not a WAV stream');
  }
  // Find the 'data' chunk
  let offset = 12;
  let dataStart = -1;
  let sampleRate = SAMPLE_RATE;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.slice(offset, offset + 4).toString('ascii');
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      sampleRate = buf.readUInt32LE(offset + 8 + 4);
    }
    if (chunkId === 'data') {
      dataStart = offset + 8;
      break;
    }
    offset += 8 + chunkSize;
  }
  if (dataStart < 0) throw new Error('WAV missing data chunk');
  const pcmBytes = buf.length - dataStart;
  const sampleCount = Math.floor(pcmBytes / 2);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = buf.readInt16LE(dataStart + i * 2) / 32768;
  }
  return { samples, sampleRate };
}

interface RmsResult {
  rms: Float32Array;
  meanRms: number;
  peakRms: number;
}

function computeRms(samples: Float32Array, hopSamples: number): RmsResult {
  const frames = Math.floor(samples.length / hopSamples);
  const rms = new Float32Array(frames);
  let mean = 0;
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const start = i * hopSamples;
    for (let j = 0; j < hopSamples; j++) {
      const s = samples[start + j];
      sum += s * s;
    }
    const r = Math.sqrt(sum / hopSamples);
    rms[i] = r;
    mean += r;
    if (r > peak) peak = r;
  }
  return { rms, meanRms: frames > 0 ? mean / frames : 0, peakRms: peak };
}

function normaliseEnergyCurve(rms: Float32Array, targetPoints = 200): number[] {
  if (rms.length === 0) return [];
  const peak = Math.max(...Array.from(rms));
  if (peak === 0) return new Array(targetPoints).fill(0);
  const out: number[] = [];
  const step = rms.length / targetPoints;
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(rms.length, Math.floor((i + 1) * step));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += rms[j];
      count++;
    }
    const v = count > 0 ? sum / count / peak : 0;
    out.push(Math.max(0, Math.min(1, v)));
  }
  return out;
}

/**
 * Half-wave-rectified spectral flux on the RMS envelope. Good-enough proxy for
 * onset strength for music — peaks in this signal correlate with beats.
 */
function computeOnsetEnvelope(rms: Float32Array): Float32Array {
  const onset = new Float32Array(rms.length);
  for (let i = 1; i < rms.length; i++) {
    const diff = rms[i] - rms[i - 1];
    onset[i] = diff > 0 ? diff : 0;
  }
  return onset;
}

interface BpmEstimate {
  bpm: number | null;
  confidence: number;
  beats: number[];
}

/**
 * Estimate BPM by autocorrelating the onset envelope at lags corresponding to
 * 60-200 BPM, then derive a beat grid by locking the BPM phase to the largest
 * onset in the first 5 seconds.
 */
function estimateBpm(onset: Float32Array, hopSeconds: number): BpmEstimate {
  if (onset.length < 100) return { bpm: null, confidence: 0, beats: [] };

  // Convert BPM range -> lag range (in onset-frame units)
  const minBpm = 60;
  const maxBpm = 200;
  const minLag = Math.max(2, Math.floor(60 / maxBpm / hopSeconds));
  const maxLag = Math.min(onset.length - 1, Math.ceil(60 / minBpm / hopSeconds));

  let bestLag = minLag;
  let bestVal = -Infinity;
  let runnerUp = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const n = onset.length - lag;
    for (let i = 0; i < n; i++) {
      sum += onset[i] * onset[i + lag];
    }
    sum /= n;
    if (sum > bestVal) {
      runnerUp = bestVal;
      bestVal = sum;
      bestLag = lag;
    } else if (sum > runnerUp) {
      runnerUp = sum;
    }
  }
  if (!Number.isFinite(bestVal) || bestVal <= 0) {
    return { bpm: null, confidence: 0, beats: [] };
  }

  const bpm = 60 / (bestLag * hopSeconds);
  const confidence = Math.max(0, Math.min(1, (bestVal - Math.max(0, runnerUp)) / (bestVal + 1e-6)));

  // Phase lock to the strongest onset in the first 5 seconds.
  const phaseSearch = Math.min(onset.length, Math.ceil(5 / hopSeconds));
  let phaseIdx = 0;
  let phaseVal = -Infinity;
  for (let i = 0; i < phaseSearch; i++) {
    if (onset[i] > phaseVal) {
      phaseVal = onset[i];
      phaseIdx = i;
    }
  }

  const beatPeriodSec = 60 / bpm;
  const startTime = phaseIdx * hopSeconds;
  const durationSec = onset.length * hopSeconds;
  const beats: number[] = [];
  for (let t = startTime; t < durationSec; t += beatPeriodSec) {
    beats.push(Number(t.toFixed(3)));
  }

  return { bpm: Number(bpm.toFixed(2)), confidence, beats };
}

function detectSilence(rms: Float32Array, hopSeconds: number): Array<{ start: number; end: number }> {
  if (rms.length === 0) return [];
  const peak = Math.max(...Array.from(rms));
  if (peak === 0) return [{ start: 0, end: rms.length * hopSeconds }];
  const threshold = peak * 0.06; // -24dB relative to peak
  const segments: Array<{ start: number; end: number }> = [];
  let silentStart: number | null = null;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] < threshold) {
      if (silentStart === null) silentStart = i;
    } else if (silentStart !== null) {
      const start = silentStart * hopSeconds;
      const end = i * hopSeconds;
      if (end - start >= 0.3) segments.push({ start, end });
      silentStart = null;
    }
  }
  if (silentStart !== null) {
    segments.push({ start: silentStart * hopSeconds, end: rms.length * hopSeconds });
  }
  return segments;
}

/**
 * Cheap 3-band spectral balance via box-filtering on the time-domain signal.
 * Not a real FFT, but gives the matcher a useful "low/mid/high" fingerprint
 * without dragging in a full spectral library.
 *
 * Implementation: split the buffer into 1024-sample blocks; for each block,
 * compute the zero-crossing rate (high-frequency proxy) and short/long
 * smoothing differences (low/mid proxy). Average across blocks.
 */
function computeSpectralBalance(samples: Float32Array): { low: number; mid: number; high: number } {
  if (samples.length < 4096) return { low: 0, mid: 0, high: 0 };
  const block = 1024;
  let lowSum = 0;
  let midSum = 0;
  let highSum = 0;
  let blocks = 0;
  for (let start = 0; start + block <= samples.length; start += block) {
    let zc = 0;
    let smoothShort = 0;
    let smoothLong = 0;
    for (let i = 1; i < block; i++) {
      const a = samples[start + i - 1];
      const b = samples[start + i];
      if ((a >= 0) !== (b >= 0)) zc++;
      smoothShort += Math.abs(b);
    }
    smoothShort /= block;
    // Long smoothing — every 32nd sample
    for (let i = 0; i < block; i += 32) {
      smoothLong += Math.abs(samples[start + i]);
    }
    smoothLong /= block / 32;
    highSum += zc / block;
    midSum += smoothShort;
    lowSum += smoothLong;
    blocks++;
  }
  if (blocks === 0) return { low: 0, mid: 0, high: 0 };
  const low = lowSum / blocks;
  const mid = midSum / blocks;
  const high = highSum / blocks;
  const total = low + mid + high || 1;
  return {
    low: Number((low / total).toFixed(3)),
    mid: Number((mid / total).toFixed(3)),
    high: Number((high / total).toFixed(3)),
  };
}

/**
 * Rough music vs speech split — speech has a characteristic ZCR pattern and
 * lower spectral balance in the lows, music has steadier RMS. We don't run a
 * Whisper VAD here; the matcher only needs a rough flag.
 */
function classifyMusicSpeech(rms: Float32Array, balance: { low: number; mid: number; high: number }): {
  hasMusic: boolean;
  hasSpeech: boolean;
} {
  if (rms.length === 0) return { hasMusic: false, hasSpeech: false };
  // RMS variance heuristic
  let mean = 0;
  for (let i = 0; i < rms.length; i++) mean += rms[i];
  mean /= rms.length;
  let variance = 0;
  for (let i = 0; i < rms.length; i++) variance += (rms[i] - mean) ** 2;
  variance /= rms.length;
  const cov = mean > 0 ? Math.sqrt(variance) / mean : 0;

  // Speech RMS tends to be high-variance (gaps between syllables) with strong mids.
  // Music tends to be low-variance and bass-heavy.
  const speech = cov > 0.55 && balance.mid > 0.25;
  const music = mean > 0.05 && cov < 0.7 && balance.low > 0.25;
  return { hasMusic: music, hasSpeech: speech };
}

function deriveSpeechSegments(
  rms: Float32Array,
  hopSeconds: number,
  hasSpeech: boolean
): Array<{ start: number; end: number }> {
  if (!hasSpeech || rms.length === 0) return [];
  const peak = Math.max(...Array.from(rms));
  if (peak === 0) return [];
  const threshold = peak * 0.18;
  const segments: Array<{ start: number; end: number }> = [];
  let activeStart: number | null = null;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] >= threshold) {
      if (activeStart === null) activeStart = i;
    } else if (activeStart !== null) {
      const start = activeStart * hopSeconds;
      const end = i * hopSeconds;
      if (end - start >= 0.4) segments.push({ start, end });
      activeStart = null;
    }
  }
  if (activeStart !== null) {
    segments.push({ start: activeStart * hopSeconds, end: rms.length * hopSeconds });
  }
  return segments;
}

/**
 * Pull a mono 22050Hz PCM stream out of the source and run the full analysis
 * pipeline above. Returns an AudioFeatures bundle the analyser maps onto the
 * StyleDNA audio fields.
 *
 * If the source has no audio track we return an empty result so the caller can
 * still produce a valid StyleDNA — silent video is a real input mode.
 *
 * `maxSeconds` caps how much audio FFmpeg actually decodes. The analyser caps
 * the same value upstream (maxAnalyzeSeconds default 90); without -t enforced
 * here, FFmpeg still decoded the full audio track which dominated runtime on
 * long references.
 */
export async function analyzeAudio(
  filePath: string,
  hasAudioStream: boolean,
  maxSeconds?: number
): Promise<AudioFeatures> {
  const empty: AudioFeatures = {
    sample_rate: SAMPLE_RATE,
    duration_seconds: 0,
    has_audio: false,
    bpm: null,
    bpm_confidence: 0,
    beats: [],
    energy_curve: [],
    silence_segments: [],
    has_music: false,
    has_speech: false,
    speech_segments: [],
    rms_mean: 0,
    rms_peak: 0,
    spectral_balance: { low: 0, mid: 0, high: 0 },
  };
  if (!hasAudioStream) return empty;

  let stdout: Buffer;
  try {
    const args = ['-hide_banner', '-nostats', '-loglevel', 'error'];
    if (maxSeconds && maxSeconds > 0) {
      args.push('-t', maxSeconds.toFixed(3));
    }
    args.push(
      '-i', filePath,
      '-vn',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-acodec', 'pcm_s16le',
      '-f', 'wav',
      '-'
    );
    const result = await runFfmpeg(args, { timeoutMs: 45_000 });
    stdout = result.stdout;
  } catch {
    // Audio extraction failed — treat as silent.
    return { ...empty, has_audio: false };
  }
  if (stdout.length < 1024) return empty;

  const { samples, sampleRate } = decodePcmWav(stdout);
  const duration = samples.length / sampleRate;
  const hopSamples = Math.round((sampleRate * HOP_MS) / 1000);
  const hopSeconds = hopSamples / sampleRate;

  const { rms, meanRms, peakRms } = computeRms(samples, hopSamples);
  const onset = computeOnsetEnvelope(rms);
  const bpm = estimateBpm(onset, hopSeconds);
  const silence = detectSilence(rms, hopSeconds);
  const balance = computeSpectralBalance(samples);
  const { hasMusic, hasSpeech } = classifyMusicSpeech(rms, balance);
  const speechSegments = deriveSpeechSegments(rms, hopSeconds, hasSpeech);
  const energyCurve = normaliseEnergyCurve(rms, 200);

  return {
    sample_rate: sampleRate,
    duration_seconds: duration,
    has_audio: true,
    bpm: bpm.bpm,
    bpm_confidence: bpm.confidence,
    beats: bpm.beats,
    energy_curve: energyCurve,
    silence_segments: silence,
    has_music: hasMusic,
    has_speech: hasSpeech,
    speech_segments: speechSegments,
    rms_mean: Number(meanRms.toFixed(4)),
    rms_peak: Number(peakRms.toFixed(4)),
    spectral_balance: balance,
  };
}
