// =============================================================================
// Arrowhead 7 — Vault helpers
// =============================================================================
// The vault is the user's personal file area on R2 (and indexed in Supabase).
// Three folders: references/, footage/, exports/. All keys live under
// `users/{uid}/vault/{folder}/...`. This module owns the path scheme and the
// Supabase mirror so the rest of the app talks about vault files via a single
// vocabulary.

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import {
  generateVaultKey,
  parseVaultKey,
  getPresignedDownloadUrl,
  deleteFromR2,
  type VaultFolder,
} from '@/lib/cloudflare/r2';

export type { VaultFolder } from '@/lib/cloudflare/r2';

export type VaultKind = 'video' | 'image' | 'audio' | 'other';
export type VaultSource =
  | 'upload'
  | 'google_drive'
  | 'dropbox'
  | 'icloud'
  | 'url'
  | 'render';

export interface VaultFile {
  id: string;
  user_id: string;
  folder: VaultFolder;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  kind: VaultKind;
  source: VaultSource;
  edit_id: string | null;
  thumbnail_url: string | null;
  duration_ms: number | null;
  external_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
  'video/x-m4v',
]);
const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
]);
const AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/ogg',
]);

export function kindForContentType(contentType: string): VaultKind {
  if (VIDEO_MIME.has(contentType)) return 'video';
  if (IMAGE_MIME.has(contentType)) return 'image';
  if (AUDIO_MIME.has(contentType)) return 'audio';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'other';
}

export function mimeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function defaultFolderForKind(kind: VaultKind): VaultFolder {
  return kind === 'image' ? 'references' : 'footage';
}

/**
 * Reserve a vault R2 key for an upload. The file isn't registered in the DB
 * yet — callers call `registerVaultFile` once the upload completes.
 */
export function reserveVaultKey(
  userId: string,
  folder: VaultFolder,
  filename: string
): string {
  return generateVaultKey(userId, folder, filename);
}

export interface RegisterVaultFileInput {
  userId: string;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  folder?: VaultFolder;
  source?: VaultSource;
  editId?: string | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  thumbnailUrl?: string | null;
  durationMs?: number | null;
}

/**
 * Insert a row in `vault_files`. Uses upsert on the r2_key column so reruns
 * (e.g. retries) don't double-count storage. Returns the row.
 */
export async function registerVaultFile(
  input: RegisterVaultFileInput
): Promise<VaultFile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createServerSupabaseClient();

  const parsed = parseVaultKey(input.r2Key);
  const folder: VaultFolder =
    input.folder ?? parsed?.folder ?? 'references';
  const kind = kindForContentType(input.contentType);

  const { data, error } = await supabase
    .from('vault_files')
    .upsert(
      {
        user_id: input.userId,
        folder,
        r2_key: input.r2Key,
        filename: input.filename,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        kind,
        source: input.source ?? 'upload',
        edit_id: input.editId ?? null,
        external_url: input.externalUrl ?? null,
        metadata: input.metadata ?? null,
        thumbnail_url: input.thumbnailUrl ?? null,
        duration_ms: input.durationMs ?? null,
      },
      { onConflict: 'r2_key' }
    )
    .select()
    .single();

  if (error) {
    console.error('registerVaultFile failed', error);
    return null;
  }
  return data as VaultFile;
}

export async function listVaultFiles(
  userId: string,
  folder?: VaultFolder
): Promise<VaultFile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('vault_files')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (folder) query = query.eq('folder', folder);
  const { data, error } = await query;
  if (error) {
    console.error('listVaultFiles failed', error);
    return [];
  }
  return (data ?? []) as VaultFile[];
}

export async function getVaultStats(
  userId: string
): Promise<{ totalBytes: number; fileCount: number }> {
  if (!isSupabaseConfigured()) return { totalBytes: 0, fileCount: 0 };
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('vault_storage_bytes, vault_file_count')
    .eq('id', userId)
    .single();
  return {
    totalBytes: Number(data?.vault_storage_bytes ?? 0),
    fileCount: Number(data?.vault_file_count ?? 0),
  };
}

export async function deleteVaultFile(
  userId: string,
  fileId: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = await createServerSupabaseClient();
  const { data: row, error: fetchErr } = await supabase
    .from('vault_files')
    .select('id, r2_key')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single();
  if (fetchErr || !row) return false;

  try {
    await deleteFromR2(row.r2_key);
  } catch (err) {
    console.error('R2 delete failed (will still remove DB row)', err);
  }

  const { error } = await supabase
    .from('vault_files')
    .delete()
    .eq('id', fileId)
    .eq('user_id', userId);
  return !error;
}

/**
 * Resolve a vault key (or a row id) into a short-lived presigned URL the
 * client can use to download or stream the file.
 */
export async function vaultDownloadUrl(
  r2Key: string,
  expiresInSeconds = 3600
): Promise<string> {
  return getPresignedDownloadUrl(r2Key, expiresInSeconds);
}
