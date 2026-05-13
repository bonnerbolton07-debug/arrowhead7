// =============================================================================
// Arrowhead 7 — Subtitle File Generation
// =============================================================================
// Convert Whisper transcription output into SRT (SubRip) and WebVTT files.

import type { WhisperSegment, WhisperTranscription, WhisperWord } from './whisper';

export interface CaptionLine {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface BuildLineOptions {
  /** Maximum characters per caption line. */
  maxCharsPerLine?: number;
  /** Maximum duration of a single caption in seconds. */
  maxLineDurationSec?: number;
}

const DEFAULT_MAX_CHARS = 42;
const DEFAULT_MAX_DURATION = 6;

/**
 * Group Whisper words into readable caption lines.
 * Falls back to segment text when word timestamps are missing.
 */
export function buildLinesFromTranscription(
  transcription: WhisperTranscription,
  options: BuildLineOptions = {}
): CaptionLine[] {
  const maxChars = options.maxCharsPerLine ?? DEFAULT_MAX_CHARS;
  const maxDur = options.maxLineDurationSec ?? DEFAULT_MAX_DURATION;

  if (transcription.words.length > 0) {
    return groupWordsIntoLines(transcription.words, maxChars, maxDur);
  }
  return transcription.segments.map((s, i) => ({
    index: i + 1,
    start: s.start,
    end: s.end,
    text: s.text,
  }));
}

export function groupWordsIntoLines(
  words: WhisperWord[],
  maxChars: number,
  maxDurationSec: number
): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: WhisperWord[] = [];
  let charCount = 0;

  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      index: lines.length + 1,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.word).join(' ').replace(/\s+([.,!?])/g, '$1'),
    });
    current = [];
    charCount = 0;
  };

  for (const word of words) {
    const addedLen = word.word.length + (current.length > 0 ? 1 : 0);
    const wouldExceedChars = charCount + addedLen > maxChars;
    const wouldExceedDuration =
      current.length > 0 && word.end - current[0].start > maxDurationSec;
    const isSentenceEnd = /[.!?]$/.test(word.word);

    if (current.length > 0 && (wouldExceedChars || wouldExceedDuration)) {
      flush();
    }

    current.push(word);
    charCount += addedLen;

    if (isSentenceEnd && charCount > maxChars / 2) {
      flush();
    }
  }
  flush();

  return lines;
}

/**
 * Build word-by-word "karaoke" lines — one entry per spoken word.
 * Use for highlight-style captions where the active word is emphasised.
 */
export function buildWordLines(words: WhisperWord[]): CaptionLine[] {
  return words.map((w, i) => ({
    index: i + 1,
    start: w.start,
    end: w.end,
    text: w.word,
  }));
}

/** Build SRT file content from caption lines. */
export function toSRT(lines: CaptionLine[]): string {
  return lines
    .map(
      (line) =>
        `${line.index}\n${formatSrtTime(line.start)} --> ${formatSrtTime(line.end)}\n${line.text}\n`
    )
    .join('\n');
}

/** Build WebVTT file content from caption lines. */
export function toVTT(lines: CaptionLine[]): string {
  const body = lines
    .map(
      (line) =>
        `${formatVttTime(line.start)} --> ${formatVttTime(line.end)}\n${line.text}\n`
    )
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const ms = Math.round(safe * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(milli)}`;
}

export function formatVttTime(seconds: number): string {
  return formatSrtTime(seconds).replace(',', '.');
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

/** Parse an SRT string back into lines. Useful for tests and round-trips. */
export function parseSRT(srt: string): CaptionLine[] {
  const blocks = srt.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const lines: CaptionLine[] = [];
  for (const block of blocks) {
    const parts = block.split('\n');
    if (parts.length < 3) continue;
    const index = Number.parseInt(parts[0], 10);
    const [startStr, endStr] = parts[1].split('-->').map((s) => s.trim());
    const text = parts.slice(2).join('\n');
    lines.push({
      index,
      start: parseSrtTime(startStr),
      end: parseSrtTime(endStr),
      text,
    });
  }
  return lines;
}

function parseSrtTime(time: string): number {
  const [h, m, rest] = time.split(':');
  const [s, ms] = rest.split(',');
  return (
    Number.parseInt(h, 10) * 3600 +
    Number.parseInt(m, 10) * 60 +
    Number.parseInt(s, 10) +
    Number.parseInt(ms, 10) / 1000
  );
}

export function buildLinesFromSegments(segments: WhisperSegment[]): CaptionLine[] {
  return segments.map((s, i) => ({
    index: i + 1,
    start: s.start,
    end: s.end,
    text: s.text,
  }));
}
