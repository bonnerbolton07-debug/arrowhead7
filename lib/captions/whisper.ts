// =============================================================================
// Arrowhead 7 — Whisper Transcription
// =============================================================================
// Speech-to-text via OpenAI Whisper API.
// Returns word- and segment-level timestamps for caption rendering.

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface WhisperTranscription {
  text: string;
  language: string;
  duration: number;
  segments: WhisperSegment[];
  words: WhisperWord[];
}

export interface TranscribeOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
}

export class WhisperUnavailableError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured');
    this.name = 'WhisperUnavailableError';
  }
}

export function isWhisperConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function transcribeFromUrl(
  mediaUrl: string,
  options: TranscribeOptions = {}
): Promise<WhisperTranscription> {
  if (!isWhisperConfigured()) {
    throw new WhisperUnavailableError();
  }

  const upstream = await fetch(mediaUrl);
  if (!upstream.ok) {
    throw new Error(`Failed to fetch media: ${upstream.status}`);
  }
  const blob = await upstream.blob();
  const filename = inferFilename(mediaUrl, blob.type);

  return transcribeFromBlob(blob, filename, options);
}

export async function transcribeFromBlob(
  blob: Blob,
  filename: string,
  options: TranscribeOptions = {}
): Promise<WhisperTranscription> {
  if (!isWhisperConfigured()) {
    throw new WhisperUnavailableError();
  }

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (options.language) form.append('language', options.language);
  if (options.prompt) form.append('prompt', options.prompt);
  if (typeof options.temperature === 'number') {
    form.append('temperature', String(options.temperature));
  }

  const response = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Whisper API error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const raw = (await response.json()) as RawWhisperResponse;
  return normalizeResponse(raw);
}

interface RawWhisperResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}

export function normalizeResponse(raw: RawWhisperResponse): WhisperTranscription {
  const segments: WhisperSegment[] = (raw.segments ?? []).map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));

  const words: WhisperWord[] = (raw.words ?? []).map((w) => ({
    word: w.word.trim(),
    start: w.start,
    end: w.end,
  }));

  return {
    text: raw.text.trim(),
    language: raw.language ?? 'en',
    duration: raw.duration ?? (segments.at(-1)?.end ?? 0),
    segments,
    words,
  };
}

function inferFilename(url: string, mimeType: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop();
    if (last && last.includes('.')) return last;
  } catch {
    // Fall through to mime-based name
  }
  const ext = mimeToExt(mimeType);
  return `audio.${ext}`;
}

function mimeToExt(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'mp4';
}
