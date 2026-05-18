import { describe, expect, it } from 'vitest';
import {
  CLOUD_IMPORT_AUDIO_MAX_BYTES,
  CLOUD_IMPORT_VIDEO_IMAGE_MAX_BYTES,
  cloudImportQuotaError,
  cloudImportSizeError,
} from './import-limits';

describe('cloud import limits', () => {
  it('blocks oversized video/image files before provider transfer', () => {
    expect(
      cloudImportSizeError({
        sizeBytes: CLOUD_IMPORT_VIDEO_IMAGE_MAX_BYTES + 1,
        contentType: 'video/mp4',
      })
    ).toContain('Direct cloud pull currently supports up to 500 MB');
  });

  it('uses the lower audio limit for music and SFX pulls', () => {
    expect(
      cloudImportSizeError({
        sizeBytes: CLOUD_IMPORT_AUDIO_MAX_BYTES + 1,
        contentType: 'audio/mpeg',
      })
    ).toContain('Direct cloud pull currently supports up to 100 MB');
  });

  it('blocks cloud imports that would exceed vault quota', () => {
    expect(
      cloudImportQuotaError({
        tier: 'free',
        usedBytes: 2 * 1024 ** 3 - 10,
        incomingBytes: 11,
      })
    ).toContain('Vault storage limit reached');
    expect(
      cloudImportQuotaError({
        tier: 'studio',
        usedBytes: 10,
        incomingBytes: 10,
      })
    ).toBeNull();
  });
});
