import { parseEditorMediaKey, parseVaultKey, getPresignedDownloadUrl } from '@/lib/cloudflare/r2';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';

export function looksLikeRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function storageKeyOwnerId(key: string): string | null {
  return parseVaultKey(key)?.userId ?? parseEditorMediaKey(key)?.userId ?? null;
}

export async function assertUserOwnsStorageKey(
  userId: string,
  key: string
): Promise<void> {
  if (!key || key.includes('..')) {
    throw new Error('Invalid storage key');
  }

  const ownerId = storageKeyOwnerId(key);
  if (ownerId) {
    if (ownerId !== userId) throw new Error('Forbidden storage key');
    return;
  }

  if (!isSupabaseConfigured()) {
    throw new Error('Storage ownership could not be verified');
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('vault_files')
    .select('id')
    .eq('user_id', userId)
    .eq('r2_key', key)
    .maybeSingle();

  if (error) throw new Error('Storage ownership check failed');
  if (!data) throw new Error('Forbidden storage key');
}

export async function getOwnedPresignedDownloadUrl(
  userId: string,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  await assertUserOwnsStorageKey(userId, key);
  return getPresignedDownloadUrl(key, expiresInSeconds);
}
