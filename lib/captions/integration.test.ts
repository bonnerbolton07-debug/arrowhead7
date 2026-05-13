// Integration test exercising the captions pipeline as the editor flow does:
// fetch a transcription, build caption lines, and attach them to a Shotstack
// timeline that also carries a free-tier watermark.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribeFromUrl } from '@/lib/captions/whisper';
import { buildCaptionTrack } from '@/lib/captions/burn-in';
import { buildTimelineFromStyleDNA } from '@/lib/shotstack/client';
import { applyWatermarkIfRequired } from '@/lib/watermark/overlay';

const FAKE_WHISPER_RESPONSE = {
  text: 'Hello world. This is captions.',
  language: 'en',
  duration: 2.4,
  segments: [
    { id: 0, start: 0, end: 1.2, text: 'Hello world.' },
    { id: 1, start: 1.2, end: 2.4, text: 'This is captions.' },
  ],
  words: [
    { word: 'Hello', start: 0.0, end: 0.4 },
    { word: 'world.', start: 0.4, end: 1.2 },
    { word: 'This', start: 1.2, end: 1.6 },
    { word: 'is', start: 1.6, end: 1.9 },
    { word: 'captions.', start: 1.9, end: 2.4 },
  ],
};

describe('editor caption + watermark flow (integration)', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith('r2://')) {
        return new Response(new Blob(['video-bytes'], { type: 'video/mp4' }), {
          status: 200,
        });
      }
      if (url.includes('api.openai.com')) {
        return new Response(JSON.stringify(FAKE_WHISPER_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('produces a timeline with captions and a free-tier watermark', async () => {
    const transcription = await transcribeFromUrl('r2://footage.mp4');
    expect(transcription.segments).toHaveLength(2);

    const captionTrack = buildCaptionTrack(transcription, { style: 'tiktok-bold' });
    expect(captionTrack).toBeDefined();
    expect(captionTrack!.clips.length).toBeGreaterThan(0);

    const config = buildTimelineFromStyleDNA('r2://footage.mp4', null, {
      targetDuration: transcription.duration,
      captions: { transcription, style: 'tiktok-bold' },
      tier: 'starter',
    });

    // Caption track + main video track + watermark track = at least 3 tracks.
    expect(config.timeline.tracks.length).toBeGreaterThanOrEqual(3);

    // Watermark is the last track (appended by applyWatermarkIfRequired).
    const watermarkClip = config.timeline.tracks.at(-1)?.clips[0];
    expect(watermarkClip).toBeDefined();
    expect(watermarkClip!.position).toBe('bottom');
  });

  it('skips watermark for pro tier but keeps captions', () => {
    const config = buildTimelineFromStyleDNA('r2://footage.mp4', null, {
      targetDuration: 5,
      captions: { transcription: FAKE_WHISPER_RESPONSE, style: 'youtube-bar' },
      tier: 'pro',
    });
    // No watermark — only caption + video track.
    expect(config.timeline.tracks).toHaveLength(2);
  });

  it('applyWatermarkIfRequired is idempotent at the contract level', () => {
    const base = buildTimelineFromStyleDNA('r2://footage.mp4', null, {
      tier: 'pro',
    });
    const after = applyWatermarkIfRequired(base, 'pro');
    expect(after).toEqual(base);
  });
});
