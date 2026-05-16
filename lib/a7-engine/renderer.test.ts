import { describe, expect, it } from 'vitest';
import { outputGeometry, planVideoClips, soundtrackSource, videoFilter } from './renderer';
import type { ShotstackRenderConfig } from '@/types/edit';

const baseConfig: ShotstackRenderConfig = {
  timeline: {
    tracks: [
      {
        clips: [
          {
            asset: { type: 'video', src: 'users/u/vault/footage/raw-a.mp4', trim: 8 },
            start: 4,
            length: 2,
            filter: 'boost',
          },
          {
            asset: { type: 'video', src: 'users/u/vault/footage/raw-b.mp4', trim: 2 },
            start: 0,
            length: 3,
          },
          {
            asset: { type: 'title', text: 'A7' },
            start: 0,
            length: 1,
          },
        ],
      },
      {
        clips: [
          {
            asset: { type: 'audio', src: 'users/u/vault/references/music.mp3' },
            start: 0,
            length: 8,
          },
        ],
      },
    ],
  },
  output: {
    format: 'mp4',
    resolution: '1080',
    fps: 30,
    size: { width: 1080, height: 1920 },
  },
};

describe('A7 native renderer planning', () => {
  it('extracts video clips in timeline order and ignores overlay clips', () => {
    const clips = planVideoClips(baseConfig);
    expect(clips).toHaveLength(2);
    expect(clips.map((clip) => clip.source)).toEqual([
      'users/u/vault/footage/raw-b.mp4',
      'users/u/vault/footage/raw-a.mp4',
    ]);
    expect(clips[0].trim).toBe(2);
    expect(clips[1].filter).toBe('boost');
  });

  it('uses soundtrack first and falls back to audio track media', () => {
    expect(soundtrackSource(baseConfig)).toBe('users/u/vault/references/music.mp3');
    expect(
      soundtrackSource({
        ...baseConfig,
        timeline: {
          ...baseConfig.timeline,
          soundtrack: { src: 'users/u/vault/references/soundtrack.wav' },
        },
      })
    ).toBe('users/u/vault/references/soundtrack.wav');
  });

  it('builds stable vertical output geometry', () => {
    expect(outputGeometry(baseConfig.output)).toEqual({
      width: 1080,
      height: 1920,
      fps: 30,
    });
  });

  it('keeps color by default and only applies grayscale when explicit', () => {
    expect(videoFilter({ width: 1080, height: 1920, fps: 30 })).not.toContain('format=gray');
    expect(videoFilter({ width: 1080, height: 1920, fps: 30 }, 'greyscale')).toContain('format=gray');
  });
});
