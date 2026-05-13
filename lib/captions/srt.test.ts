import { describe, it, expect } from 'vitest';
import {
  buildLinesFromTranscription,
  buildWordLines,
  formatSrtTime,
  formatVttTime,
  groupWordsIntoLines,
  parseSRT,
  toSRT,
  toVTT,
} from './srt';
import type { WhisperTranscription } from './whisper';

const TRANSCRIPTION: WhisperTranscription = {
  text: 'Hello world this is a test of captions',
  language: 'en',
  duration: 4.2,
  segments: [
    { id: 0, start: 0, end: 2, text: 'Hello world this is' },
    { id: 1, start: 2, end: 4.2, text: 'a test of captions' },
  ],
  words: [
    { word: 'Hello', start: 0.0, end: 0.4 },
    { word: 'world', start: 0.4, end: 0.9 },
    { word: 'this', start: 0.9, end: 1.2 },
    { word: 'is', start: 1.2, end: 1.5 },
    { word: 'a', start: 1.5, end: 1.7 },
    { word: 'test', start: 1.7, end: 2.1 },
    { word: 'of', start: 2.1, end: 2.4 },
    { word: 'captions.', start: 2.4, end: 3.0 },
  ],
};

describe('formatSrtTime', () => {
  it('formats whole seconds with millisecond precision', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(1)).toBe('00:00:01,000');
    expect(formatSrtTime(61.5)).toBe('00:01:01,500');
    expect(formatSrtTime(3661.123)).toBe('01:01:01,123');
  });

  it('clamps negatives to zero', () => {
    expect(formatSrtTime(-1)).toBe('00:00:00,000');
  });
});

describe('formatVttTime', () => {
  it('uses a dot separator', () => {
    expect(formatVttTime(1.234)).toBe('00:00:01.234');
  });
});

describe('groupWordsIntoLines', () => {
  it('breaks at the character limit', () => {
    const lines = groupWordsIntoLines(TRANSCRIPTION.words, 20, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.text.length).toBeLessThanOrEqual(22);
    }
  });

  it('respects a duration cap', () => {
    const lines = groupWordsIntoLines(TRANSCRIPTION.words, 999, 1);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.end - line.start).toBeLessThanOrEqual(1.5);
    }
  });

  it('emits sequential 1-based indices', () => {
    const lines = groupWordsIntoLines(TRANSCRIPTION.words, 20, 10);
    expect(lines[0].index).toBe(1);
    expect(lines.at(-1)?.index).toBe(lines.length);
  });
});

describe('buildLinesFromTranscription', () => {
  it('prefers word timestamps when available', () => {
    const lines = buildLinesFromTranscription(TRANSCRIPTION);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].start).toBe(0);
  });

  it('falls back to segments when no words are present', () => {
    const lines = buildLinesFromTranscription({
      ...TRANSCRIPTION,
      words: [],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('Hello world this is');
  });
});

describe('buildWordLines', () => {
  it('emits one line per word', () => {
    const lines = buildWordLines(TRANSCRIPTION.words);
    expect(lines).toHaveLength(TRANSCRIPTION.words.length);
    expect(lines[0].text).toBe('Hello');
  });
});

describe('toSRT', () => {
  it('produces a parseable SRT document', () => {
    const lines = buildLinesFromTranscription(TRANSCRIPTION);
    const srt = toSRT(lines);
    expect(srt).toContain('1\n');
    expect(srt).toContain('-->');
    const round = parseSRT(srt);
    expect(round).toHaveLength(lines.length);
    expect(round[0].text).toBe(lines[0].text);
  });
});

describe('toVTT', () => {
  it('starts with a WEBVTT header', () => {
    const lines = buildLinesFromTranscription(TRANSCRIPTION);
    const vtt = toVTT(lines);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('-->');
  });
});
