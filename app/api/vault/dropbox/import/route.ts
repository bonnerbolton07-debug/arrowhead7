// =============================================================================
// Arrowhead 7 — Dropbox: import into vault
// =============================================================================
// Streams the Dropbox file body through the multipart pull pipeline into the
// user's vault, then registers the resulting row.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, requireUser } from '@/lib/supabase/server';
import {
  getValidDropboxAccessToken,
  downloadDropboxFile,
} from '@/lib/cloud/dropbox';
import { streamToR2, sanitizeFilename, mimeFromName } from '@/lib/cloud/pull';
import {
  createPipelineRequestId,
  recordPipelineEvent,
} from '@/lib/diagnostics/pipeline-events';
import {
  reserveVaultKey,
  registerVaultFile,
  kindForContentType,
  defaultFolderForKind,
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
  const requestId = createPipelineRequestId('dropbox_import');
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
      provider: 'dropbox',
      operation: 'import_to_vault',
      stage: 'request_received',
      status: 'started',
    });
    const body = (await request.json()) as {
      path?: string;
      name?: string;
      folder?: VaultFolder;
    };
    const path = body.path;
    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    const { accessToken } = await getValidDropboxAccessToken(user.id);
    await recordPipelineEvent({
      userId: user.id,
      requestId,
      area: 'cloud_import',
      provider: 'dropbox',
      operation: 'import_to_vault',
      stage: 'provider_connected',
      status: 'progress',
    });
    const filename = sanitizeFilename(body.name || path.split('/').pop() || 'video.mp4');
    const contentType = mimeFromName(filename);
    const kind = kindForContentType(contentType);
    if (kind === 'other') {
      await recordPipelineEvent({
        userId: user.id,
        requestId,
        area: 'cloud_import',
        provider: 'dropbox',
        operation: 'import_to_vault',
        stage: 'validate_media',
        status: 'blocked',
        httpStatus: 415,
        reason: 'unsupported_media_type',
        message: 'Only video, image, and audio files can be pulled into A7.',
        contentType,
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
    const r2Key = reserveVaultKey(user.id, folder, filename);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLOUD_IMPORT_TIMEOUT_MS);
    const { stream, contentLength } = await downloadDropboxFile({
      accessToken,
      path,
      signal: controller.signal,
    });
    const sizeError = cloudImportSizeError({
      sizeBytes: contentLength,
      contentType,
    });
    if (sizeError) {
      clearTimeout(timeout);
      await recordPipelineEvent({
        userId: user.id,
        requestId,
        area: 'cloud_import',
        provider: 'dropbox',
        operation: 'import_to_vault',
        stage: 'validate_size',
        status: 'blocked',
        httpStatus: 413,
        reason: 'file_too_large',
        message: sizeError,
        contentType,
        fileSizeBytes: contentLength || null,
        folder,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: sizeError, requestId }, { status: 413 });
    }
    if (contentLength > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, vault_storage_bytes')
        .eq('id', user.id)
        .single();
      const quotaError = cloudImportQuotaError({
        tier: profile?.subscription_tier,
        usedBytes: Number(profile?.vault_storage_bytes ?? 0),
        incomingBytes: contentLength,
      });
      if (quotaError) {
        clearTimeout(timeout);
        await recordPipelineEvent({
          userId: user.id,
          requestId,
          area: 'cloud_import',
          provider: 'dropbox',
          operation: 'import_to_vault',
          stage: 'validate_quota',
          status: 'blocked',
          httpStatus: 403,
          reason: 'storage_quota_exceeded',
          message: quotaError,
          contentType,
          fileSizeBytes: contentLength,
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
      provider: 'dropbox',
      operation: 'import_to_vault',
      stage: 'upload_to_r2',
      status: 'progress',
      contentType,
      fileSizeBytes: contentLength || null,
      folder,
    });
    const out = await streamToR2({
      key: r2Key,
      contentType,
      stream,
      maxBytes: cloudImportLimitForKind(kind),
    }).finally(() => clearTimeout(timeout));

    const file = await registerVaultFile({
      userId: user.id,
      r2Key,
      filename,
      contentType: out.contentType,
      sizeBytes: out.bytes,
      folder,
      source: 'dropbox',
      metadata: { dropbox_path: path },
    });
    if (!file) {
      await recordPipelineEvent({
        userId: user.id,
        requestId,
        area: 'cloud_import',
        provider: 'dropbox',
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
      provider: 'dropbox',
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
        fallbackName: filename,
        fallbackSize: out.bytes,
        fallbackContentType: out.contentType,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'Dropbox not connected') {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    if (userId) {
      const timedOut = e instanceof Error && e.name === 'AbortError';
      const tooLarge = /file exceeds/i.test(msg);
      await recordPipelineEvent({
        userId,
        requestId,
        area: 'cloud_import',
        provider: 'dropbox',
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
    console.error('Dropbox import error:', e);
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
