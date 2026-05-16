import { describe, it, expect } from 'vitest';
import { RENDER_MEDIA_LIMITS, buildTimelineFromStyleDNA, sanitizeShotstackConfig } from './client';
import type { WhisperTranscription } from '@/lib/captions/whisper';

describe('buildTimelineFromStyleDNA', () => {
  it('produces a valid minimal Shotstack config without a Style DNA', () => {
    const config = buildTimelineFromStyleDNA('r2://source.mp4');
    expect(config.timeline.tracks).toHaveLength(1);
    expect(config.timeline.tracks[0].clips).toHaveLength(1);
    expect(config.timeline.tracks[0].clips[0].asset.type).toBe('video');
    expect(config.timeline.tracks[0].clips[0].asset.src).toBe('r2://source.mp4');
    expect(config.output.format).toBe('mp4');
    expect(config.output.resolution).toBe('1080');
  });

  it('respects targetDuration on the video clip', () => {
    const config = buildTimelineFromStyleDNA('r2://source.mp4', null, {
      targetDuration: 22,
    });
    const clip = config.timeline.tracks[0].clips[0];
    expect(clip.length).toBe(22);
  });

  it('overrides output format and resolution', () => {
    const config = buildTimelineFromStyleDNA('r2://source.mp4', null, {
      outputFormat: 'webm',
      outputResolution: '4k',
      outputFps: 60,
    });
    expect(config.output.format).toBe('webm');
    expect(config.output.resolution).toBe('4k');
    expect(config.output.fps).toBe(60);
  });

  it('adds a caption track when captions are provided', () => {
    const transcription: WhisperTranscription = {
      text: 'Hello world',
      language: 'en',
      duration: 1,
      segments: [{ id: 0, start: 0, end: 1, text: 'Hello world' }],
      words: [
        { word: 'Hello', start: 0, end: 0.5 },
        { word: 'world', start: 0.5, end: 1 },
      ],
    };
    const config = buildTimelineFromStyleDNA('r2://source.mp4', null, {
      captions: { transcription, style: 'tiktok-bold' },
    });
    expect(config.timeline.tracks.length).toBeGreaterThanOrEqual(2);
    const captionTrack = config.timeline.tracks[0];
    expect(captionTrack.clips[0].asset.type).toBe('title');
  });

  it('stamps a watermark when tier is free', () => {
    const config = buildTimelineFromStyleDNA('r2://source.mp4', null, {
      tier: 'free',
    });
    expect(config.timeline.tracks.length).toBeGreaterThanOrEqual(2);
    const watermarkClip = config.timeline.tracks.at(-1)?.clips[0];
    expect(watermarkClip?.asset.type).toBe('title');
    expect(watermarkClip?.asset.style).toBe('minimal');
  });

  it('omits the watermark for pro tier', () => {
    const config = buildTimelineFromStyleDNA('r2://source.mp4', null, {
      tier: 'pro',
    });
    expect(config.timeline.tracks).toHaveLength(1);
  });

  it('distills unlimited project media into a bounded render slate', () => {
    const config = buildTimelineFromStyleDNA('r2://source.mp4', null, {
      targetDuration: 30,
      sourceMedia: [
        { type: 'video', url: 'r2://primary.mp4' },
        ...Array.from({ length: 20 }, (_, i) => ({ type: 'image' as const, url: `r2://image-${i}.jpg` })),
        ...Array.from({ length: 5 }, (_, i) => ({ type: 'audio' as const, url: `r2://audio-${i}.mp3` })),
      ],
    });

    const clips = config.timeline.tracks.flatMap((track) => track.clips);
    const supplementalVisuals = clips.filter((clip) => clip.asset.src?.includes('image-'));
    const supplementalAudio = clips.filter((clip) => clip.asset.src?.includes('audio-'));

    expect(supplementalVisuals).toHaveLength(RENDER_MEDIA_LIMITS.supplementalVisuals);
    expect(supplementalAudio).toHaveLength(RENDER_MEDIA_LIMITS.supplementalAudio);
  });

  it('normalizes unsupported Shotstack title styles before submit', () => {
    const config = buildTimelineFromStyleDNA('r2://source.mp4', null, {
      captions: {
        transcription: {
          text: 'Hello',
          language: 'en',
          duration: 1,
          segments: [{ id: 0, start: 0, end: 1, text: 'Hello' }],
          words: [{ word: 'Hello', start: 0, end: 1 }],
        },
        style: 'tiktok-bold',
      },
      tier: 'free',
    });
    config.timeline.tracks[0].clips[0].asset.style = 'font-family: Inter; color: white;';

    const safe = sanitizeShotstackConfig(config);
    const titleClips = safe.timeline.tracks
      .flatMap((track) => track.clips)
      .filter((clip) => clip.asset.type === 'title');

    expect(titleClips.length).toBeGreaterThan(0);
    expect(titleClips.every((clip) => typeof clip.asset.style === 'string')).toBe(true);
    expect(titleClips.map((clip) => clip.asset.style)).not.toContain('font-family: Inter; color: white;');
  });
});
