// =============================================================================
// Arrowhead 7 — Google Drive: import into vault
// =============================================================================
// Streams a Drive file into the user's vault under
// `users/{uid}/vault/{folder}/...` via the multipart pull pipeline (so the
// Lambda never buffers the full file) and registers it in vault_files.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, requireUser } from '@/lib/supabase/server';
import {
  getValidDriveAccessToken,
  downloadDriveFile,
  getDriveFile,
} from '@/lib/cloud/google-drive';
import { streamToR2 } from '@/lib/cloud/pull';
import {
  createPipelineRequestId,
  recordPipelineEvent,
} from '@/lib/diagnostics/pipeline-events';
import {
  reserveVaultKey,
  registerVaultFile,
  kindForContentType,
  defaultFolderForKind,
  mimeFromFilename,
  type VaultFolder,
} from '@/lib/vault';
import { vaultImportResponse } from '@/lib/vault/import-response';
import {
  CLOUD_IMPORT_TIMEOUT_MS,
  cloudImportLimitForKind,
  cloudImportQuotaError,
  cloudImportSizeError,
} from '@/lib/vault/import-limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const requestId = createPipelineRequestId('gdrive_import');
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();
    userId = user.id;
    await recordPipelineEvent({
      userId: user.id,
      requestId,
      area: 'cloud_import',
      provider: 'google_drive',
      operation: 'import_to_vault',
      stage: 'request_received',
      status: 'started',
    });
    const body = (await request.json()) as {
      fileId?: string;
      folder?: VaultFolder;
    };
    const fileId = body.fileId;
    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const { accessToken } = await getValidDriveAccessToken(user.id);
    await recordPipelineEvent({
      userId: user.id,
      requestId,
      area: 'cloud_import',
      provider: 'google_drive',
      operation: 'import_to_vault',
      stage: 'provider_connected',
      status: 'progress',
    });
    const meta = await getDriveFile({ accessToken, fileId });

    const metaContentType =
      meta.mimeType && meta.mimeType !== 'application/octet-stream'
        ? meta.mimeType
        : mimeFromFilename(meta.name);
    const fallbackContentType = metaContentType || 'application/octet-stream';
    const kind = kindForContentType(fallbackContentType);
    if (kind === 'other') {
      await recordPipelineEvent({
        userId: user.id,
        requestId,
        area: 'cloud_import',
        provider: 'google_drive',
        operation: 'import_to_vault',
        stage: 'validate_media',
        status: 'blocked',
        httpStatus: 415,
        reason: 'unsupported_media_type',
        message: 'Only video, image, and audio files can be pulled into A7.',
        contentType: fallbackContentType,
        fileSizeBytes: Number(meta.size ?? 0) || null,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        {
          error: 'Only video, image, and audio files can be pulled into A7.',
          requestId,
        },
        { status: 415 }
      );
    }
    const folder: VaultFolder = body.folder ?? defaultFolderForKind(kind);
    const r2Key = reserveVaultKey(user.id, folder, meta.name);
    const metaSize = Number(meta.size ?? 0) || 0;
    const sizeError = cloudImportSizeError({
      sizeBytes: metaSize,
      contentType: fallbackContentType,
    });
    if (sizeError) {
      await recordPipelineEvent({
        userId: user.id,
        requestId,
        area: 'cloud_import',
        provider: 'google_drive',
        operation: 'import_to_vault',
        stage: 'validate_size',
        status: 'blocked',
        httpStatus: 413,
        reason: 'file_too_large',
        message: sizeError,
        contentType: fallbackContentType,
        fileSizeBytes: metaSize,
        folder,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: sizeError, requestId }, { status: 413 });
    }
    if (metaSize > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, vault_storage_bytes')
        .eq('id', user.id)
        .single();
      const quotaError = cloudImportQuotaError({
        tier: profile?.subscription_tier,
        usedBytes: Number(profile?.vault_storage_bytes ?? 0),
        incomingBytes: metaSize,
      });
      if (quotaError) {
        await recordPipelineEvent({
          userId: user.id,
          requestId,
          area: 'cloud_import',
          provider: 'google_drive',
          operation: 'import_to_vault',
          stage: 'validate_quota',
          status: 'blocked',
          httpStatus: 403,
          reason: 'storage_quota_exceeded',
          message: quotaError,
          contentType: fallbackContentType,
          fileSizeBytes: metaSize,
          folder,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: quotaError, requestId }, { status: 403 });
      }
    }
    await recordPipelineEvent({
      userId: user.id,
      requestId,
      area: 'cloud_import',
      provider: 'google_drive',
      operation: 'import_to_vault',
      stage: 'metadata_loaded',
      status: 'progress',
      contentType: fallbackContentType,
      fileSizeBytes: metaSize || null,
      folder,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLOUD_IMPORT_TIMEOUT_MS);
    const { stream, contentType, contentLength } = await downloadDriveFile({
      accessToken,
      fileId,
      signal: controller.signal,
    });
    const effectiveContentType =
      contentType && contentType !== 'application/octet-stream'
        ? contentType
        : fallbackContentType;
    const downloadSize = contentLength || metaSize;
    const downloadSizeError = cloudImportSizeError({
      sizeBytes: downloadSize,
      contentType: effectiveContentType,
    });
    if (downloadSizeError) {
      clearTimeout(timeout);
      await recordPipelineEvent({
        userId: user.id,
        requestId,
        area: 'cloud_import',
        provider: 'google_drive',
        operation: 'import_to_vault',
        stage: 'validate_download_size',
        status: 'blocked',
        httpStatus: 413,
        reason: 'file_too_large',
        message: downloadSizeError,
        contentType: effectiveContentType,
        fileSizeBytes: downloadSize,
        folder,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: downloadSizeError, requestId }, { status: 413 });
    }
    await recordPipelineEvent({
      userId: user.id,
      requestId,
      area: 'cloud_import',
      provider: 'google_drive',
      operation: 'import_to_vault',
      stage: 'upload_to_r2',
      status: 'progress',
      contentType: effectiveContentType,
      fileSizeBytes: downloadSize || null,
      folder,
    });
    const out = await streamToR2({
      key: r2Key,
      contentType: effectiveContentType,
      stream,
      maxBytes: cloudImportLimitForKind(kind),
    }).finally(() => clearTimeout(timeout));

    const file = await registerVaultFile({
      userId: user.id,
      r2Key,
      filename: meta.name,
      contentType: out.contentType,
      sizeBytes: out.bytes,
      folder,
      source: 'google_drive',
      metadata: {
        drive_file_id: fileId,
        drive_web_view_link: meta.webViewLink ?? null,
      },
      thumbnailUrl: meta.thumbnailLink ?? null,
      durationMs: meta.videoMediaMetadata?.durationMillis
        ? Number(meta.videoMediaMetadata.durationMillis)
        : null,
    });
    if (!file) {
      await recordPipelineEvent({
        userId: user.id,
        requestId,
        area: 'cloud_import',
        provider: 'google_drive',
        operation: 'import_to_vault',
        stage: 'vault_register',
        status: 'failed',
        httpStatus: 500,
        reason: 'vault_register_failed',
        message: 'A7 pulled the file but could not save the vault record.',
        contentType: out.contentType,
        fileSizeBytes: out.bytes,
        folder,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        {
          error: 'A7 pulled the file but could not save the vault record. Try again.',
          requestId,
        },
        { status: 500 }
      );
    }
    await recordPipelineEvent({
      userId: user.id,
      requestId,
      area: 'cloud_import',
      provider: 'google_drive',
      operation: 'import_to_vault',
      stage: 'completed',
      status: 'succeeded',
      contentType: out.contentType,
      fileSizeBytes: out.bytes,
      folder,
      durationMs: Date.now() - startedAt,
      metadata: { vault_file_saved: true },
    });

    return NextResponse.json(
      vaultImportResponse({
        key: r2Key,
        file,
        fallbackName: meta.name,
        fallbackSize: out.bytes,
        fallbackContentType: effectiveContentType,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'Google Drive not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    if (userId) {
      const timedOut = e instanceof Error && e.name === 'AbortError';
      const tooLarge = /file exceeds/i.test(msg);
      await recordPipelineEvent({
        userId,
        requestId,
        area: 'cloud_import',
        provider: 'google_drive',
        operation: 'import_to_vault',
        stage: timedOut ? 'provider_to_r2_timeout' : tooLarge ? 'validate_stream_size' : 'failed',
        status: timedOut ? 'timeout' : tooLarge ? 'blocked' : 'failed',
        httpStatus: timedOut ? 504 : tooLarge ? 413 : 502,
        reason: timedOut ? 'cloud_pull_timeout' : tooLarge ? 'file_too_large' : 'cloud_pull_failed',
        message: timedOut
          ? 'Cloud pull timed out before the direct import could finish.'
          : tooLarge
          ? 'Cloud import exceeded the per-file limit during transfer.'
          : msg,
        durationMs: Date.now() - startedAt,
      });
    }
    console.error('Drive import error:', e);
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Cloud pull timed out before the direct import could finish. Try a shorter/smaller clip.',
          requestId,
        },
        { status: 504 }
      );
    }
    if (/file exceeds/i.test(msg)) {
      return NextResponse.json(
        { error: 'This file is too large for direct cloud pull. Try a shorter/smaller clip.', requestId },
        { status: 413 }
      );
    }
    return NextResponse.json({ error: msg, requestId }, { status: 502 });
  }
}
