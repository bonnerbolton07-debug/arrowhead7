import { kindForContentType, type VaultKind } from '@/lib/vault';
import { TIER_LIMITS, type SubscriptionTier } from '@/types';

export const CLOUD_IMPORT_VIDEO_IMAGE_MAX_BYTES = 500 * 1024 * 1024;
export const CLOUD_IMPORT_AUDIO_MAX_BYTES = 100 * 1024 * 1024;
export const CLOUD_IMPORT_TIMEOUT_MS = 240_000;

export function cloudImportLimitForKind(kind: VaultKind): number {
  return kind === 'audio'
    ? CLOUD_IMPORT_AUDIO_MAX_BYTES
    : CLOUD_IMPORT_VIDEO_IMAGE_MAX_BYTES;
}

export function cloudImportLimitForContentType(contentType: string): number {
  return cloudImportLimitForKind(kindForContentType(contentType));
}

export function formatImportLimit(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

export function cloudImportSizeError(input: {
  sizeBytes?: number | null;
  contentType: string;
}): string | null {
  const size = Number(input.sizeBytes ?? 0);
  if (!size) return null;
  const limit = cloudImportLimitForContentType(input.contentType);
  if (size <= limit) return null;
  return `This file is ${(size / 1024 / 1024).toFixed(1)} MB. Direct cloud pull currently supports up to ${formatImportLimit(limit)} per file.`;
}

export function cloudImportQuotaError(input: {
  tier: SubscriptionTier | string | null | undefined;
  usedBytes: number;
  incomingBytes: number;
}): string | null {
  const tier =
    input.tier === 'pro' || input.tier === 'studio' || input.tier === 'free'
      ? input.tier
      : 'free';
  const storageGb = TIER_LIMITS[tier].storage_gb;
  if (storageGb === -1) return null;
  const quotaBytes = storageGb * 1024 ** 3;
  if (input.usedBytes + input.incomingBytes <= quotaBytes) return null;
  return 'Vault storage limit reached. Delete files or upgrade before importing more media.';
}
