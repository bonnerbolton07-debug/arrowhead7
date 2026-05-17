import { describe, expect, it } from 'vitest';
import { vaultImportResponse } from './import-response';
import type { VaultFile } from './index';

function vaultFile(overrides: Partial<VaultFile> = {}): VaultFile {
  return {
    id: 'file-1',
    user_id: 'user-1',
    folder: 'footage',
    r2_key: 'users/user-1/vault/footage/clip.mp4',
    filename: 'clip.mp4',
    content_type: 'video/mp4',
    size_bytes: 1234,
    kind: 'video',
    source: 'google_drive',
    edit_id: null,
    thumbnail_url: null,
    duration_ms: null,
    external_url: null,
    metadata: null,
    created_at: '2026-05-17T00:00:00.000Z',
    updated_at: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('vaultImportResponse', () => {
  it('returns the flat editor import contract alongside the vault file', () => {
    const file = vaultFile({ edit_id: 'edit-1' });

    expect(
      vaultImportResponse({
        key: file.r2_key,
        file,
        fallbackName: 'fallback.mov',
        fallbackSize: 1,
        fallbackContentType: 'video/quicktime',
      })
    ).toMatchObject({
      key: file.r2_key,
      editId: 'edit-1',
      name: 'clip.mp4',
      size: 1234,
      mimeType: 'video/mp4',
      file,
    });
  });

  it('falls back to import metadata when vault registration is unavailable', () => {
    expect(
      vaultImportResponse({
        key: 'users/user-1/vault/footage/fallback.mov',
        file: null,
        fallbackName: 'fallback.mov',
        fallbackSize: 999,
        fallbackContentType: 'video/quicktime',
      })
    ).toMatchObject({
      editId: null,
      name: 'fallback.mov',
      size: 999,
      mimeType: 'video/quicktime',
    });
  });
});
