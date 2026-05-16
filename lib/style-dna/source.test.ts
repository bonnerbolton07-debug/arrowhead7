import { describe, expect, it } from 'vitest';
import { looksLikeR2Key } from './source';

describe('looksLikeR2Key', () => {
  it('accepts editor and vault media keys', () => {
    expect(looksLikeR2Key('sources/user-1/edit-1/clip.mp4')).toBe(true);
    expect(looksLikeR2Key('references/user-1/edit-1/ref.mp4')).toBe(true);
    expect(looksLikeR2Key('users/user-1/vault/footage/clip.mp4')).toBe(true);
    expect(looksLikeR2Key('users/user-1/vault/references/ref.mp4')).toBe(true);
  });
});
