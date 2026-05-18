import { describe, expect, it } from 'vitest';
import { storageKeyOwnerId } from './ownership';

describe('storage ownership helpers', () => {
  it('extracts owner ids from vault keys', () => {
    expect(
      storageKeyOwnerId('users/user-1/vault/footage/clip.mp4')
    ).toBe('user-1');
  });

  it('extracts owner ids from editor upload keys', () => {
    expect(
      storageKeyOwnerId('sources/user-2/edit-1/clip.mp4')
    ).toBe('user-2');
    expect(
      storageKeyOwnerId('references/user-3/edit-2/ref.mov')
    ).toBe('user-3');
  });

  it('does not infer ownership from legacy processing keys', () => {
    expect(storageKeyOwnerId('processing/edit-1/render.mp4')).toBeNull();
  });
});
