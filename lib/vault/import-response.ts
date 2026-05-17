import type { VaultFile } from '@/lib/vault';

export interface VaultImportResponseInput {
  key: string;
  file: VaultFile | null;
  fallbackName: string;
  fallbackSize: number;
  fallbackContentType: string;
}

export function vaultImportResponse(input: VaultImportResponseInput) {
  return {
    key: input.key,
    editId: input.file?.edit_id ?? null,
    name: input.file?.filename ?? input.fallbackName,
    size: input.file?.size_bytes ?? input.fallbackSize,
    mimeType: input.file?.content_type ?? input.fallbackContentType,
    file: input.file,
  };
}
