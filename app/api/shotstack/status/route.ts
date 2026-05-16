// =============================================================================
// Arrowhead 7 — Render Status Polling Route
// =============================================================================
// Client polls this to check render progress

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { getRenderStatus } from '@/lib/shotstack/client';
import { uploadFromUrl } from '@/lib/cloudflare/stream';
import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';
import { A7_ENGINE_RENDER_ID_PREFIX } from '@/lib/a7-engine/renderer';
import { engineForProviderRenderId, RENDER_ENGINE_VERSION } from '@/lib/render/provider';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const STREAM_COPY_TIMEOUT_MS = 12_000;
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 45 * 60 * 1000);
type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type MutationClient = SupabaseServerClient;

function mutationClient(fallback: SupabaseServerClient): MutationClient {
  return isAdminConfigured() ? getAdminClient() as unknown as MutationClient : fallback;
}

function objectValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function a7OutputKey(renderConfig: unknown): string | null {
  const value = objectValue(renderConfig, 'a7_engine_output_key');
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function a7VaultFileId(renderConfig: unknown): string | null {
  const events = objectValue(renderConfig, 'a7_render_events');
  if (!Array.isArray(events)) return null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const value = objectValue(event, 'vaultFileId');
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer!));
}

async function refundRenderCreditOnce(
  supabase: SupabaseServerClient,
  userId: string,
  editId: string
) {
  const { data: existingRefund } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'refund')
    .eq('reference_id', editId)
    .maybeSingle();

  if (existingRefund) return;

  const { data: refunded } = await supabase.rpc('refund_credit', {
    p_user_id: userId,
    p_amount: 1,
  });
  const newBalance = refunded?.[0]?.credits_remaining;
  if (typeof newBalance === 'number') {
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: 1,
      balance_after: newBalance,
      reason: 'refund',
      reference_id: editId,
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();
    const jobId = request.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Fetch the render job
    const { data: job, error: jobError } = await supabase
      .from('render_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // If already completed or failed, return cached status with output URLs.
    if (job.status === 'completed' || job.status === 'failed') {
      const { data: edit } = await supabase
        .from('edits')
        .select('output_video_url, output_thumbnail_url, output_stream_uid, render_config')
        .eq('id', job.edit_id)
        .eq('user_id', user.id)
        .maybeSingle();
      const engineInfo = engineForProviderRenderId(job.shotstack_render_id);
      const durableOutputKey = engineInfo.engine === 'a7_engine'
        ? a7OutputKey(edit?.render_config)
        : null;
      const vaultFileId = engineInfo.engine === 'a7_engine'
        ? a7VaultFileId(edit?.render_config)
        : null;
      const playbackUrl = durableOutputKey
        ? await getPresignedDownloadUrl(durableOutputKey, 6 * 3600)
        : edit?.output_video_url ?? null;
      return NextResponse.json({
        status: job.status,
        progress: job.progress,
        error: job.error_message,
        playbackUrl,
        thumbnailUrl: edit?.output_thumbnail_url ?? null,
        streamUid: edit?.output_stream_uid ?? null,
        outputKey: durableOutputKey,
        vaultFileId,
        engine: engineInfo.engine,
        engineVersion: engineInfo.engineVersion,
      });
    }

    const startedAt = job.started_at ? new Date(job.started_at as string).getTime() : NaN;
    if (Number.isFinite(startedAt) && Date.now() - startedAt > RENDER_TIMEOUT_MS) {
      const message = 'Render timed out. Your credit has been returned. Try again with a shorter clip or fewer media layers.';
      const mutations = mutationClient(supabase);
      await mutations
        .from('render_jobs')
        .update({
          status: 'failed',
          error_message: message,
        })
        .eq('id', jobId)
        .eq('user_id', user.id);

      await mutations
        .from('edits')
        .update({ status: 'failed' })
        .eq('id', job.edit_id)
        .eq('user_id', user.id);

      await refundRenderCreditOnce(supabase, user.id, job.edit_id);

      return NextResponse.json({
        status: 'failed',
        progress: job.progress ?? 0,
        error: message,
      });
    }

    if (String(job.shotstack_render_id ?? '').startsWith(A7_ENGINE_RENDER_ID_PREFIX)) {
      return NextResponse.json({
        status: job.status,
        progress: job.progress ?? 0,
        engine: 'a7_engine',
        engineVersion: RENDER_ENGINE_VERSION,
        warning: 'A7 native render completed with the A7 Engine.',
      });
    }

    // Poll Shotstack
    let shotstackStatus: Awaited<ReturnType<typeof getRenderStatus>>;
    try {
      shotstackStatus = await getRenderStatus(job.shotstack_render_id);
    } catch (err) {
      console.error('[shotstack/status] provider status unavailable', {
        jobId,
        editId: job.edit_id,
        error: err instanceof Error ? err.message.slice(0, 300) : 'unknown',
      });
      await mutationClient(supabase)
        .from('render_jobs')
        .update({
          shotstack_status: 'status_unavailable',
          error_message: 'Renderer status is temporarily unavailable.',
        })
        .eq('id', jobId)
        .eq('user_id', user.id);
      return NextResponse.json({
        status: 'processing',
        progress: job.progress ?? 0,
        shotstackStatus: 'status_unavailable',
        warning: 'Renderer status is temporarily unavailable. A7 is still checking and your job is safe.',
      });
    }

    // If Shotstack is done, mark the edit completed immediately with the
    // Shotstack output URL. Any secondary hosting must never block completion.
    if (shotstackStatus.status === 'done' && shotstackStatus.url) {
      const completedAt = new Date().toISOString();
      let playbackUrl = shotstackStatus.url;
      let thumbnailUrl = '';
      let streamUid = '';

      const mutations = mutationClient(supabase);
      await mutations
        .from('render_jobs')
        .update({
          status: 'completed',
          progress: 100,
          completed_at: completedAt,
        })
        .eq('id', jobId)
        .eq('user_id', user.id);

      await mutations
        .from('edits')
        .update({
          status: 'completed',
          output_video_url: playbackUrl,
          output_stream_uid: null,
          output_thumbnail_url: null,
          completed_at: completedAt,
        })
        .eq('id', job.edit_id)
        .eq('user_id', user.id);

      // Best-effort Stream copy for better playback. If Cloudflare is slow or
      // unavailable, the completed edit still has the Shotstack MP4 URL.
      let streamResult: { uid: string; playbackUrl: string; thumbnailUrl: string };
      try {
        streamResult = await withTimeout(
          uploadFromUrl(shotstackStatus.url, {
            name: `edit-${job.edit_id}`,
            editId: job.edit_id,
          }),
          STREAM_COPY_TIMEOUT_MS,
          'Cloudflare Stream copy'
        );
        thumbnailUrl = streamResult.thumbnailUrl;
        streamUid = streamResult.uid;
        await mutations
          .from('edits')
          .update({
            output_stream_uid: streamUid,
            output_thumbnail_url: thumbnailUrl,
          })
          .eq('id', job.edit_id)
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Cloudflare Stream copy skipped; using Shotstack output URL fallback', err);
      }

      return NextResponse.json({
        status: 'completed',
        progress: 100,
        playbackUrl,
        thumbnailUrl,
        streamUid,
      });
    }

    // If failed
    if (shotstackStatus.status === 'failed') {
      const mutations = mutationClient(supabase);
      await mutations
        .from('render_jobs')
        .update({
          status: 'failed',
          error_message: shotstackStatus.error || 'Render failed',
        })
        .eq('id', jobId)
        .eq('user_id', user.id);

      await mutations
        .from('edits')
        .update({ status: 'failed' })
        .eq('id', job.edit_id)
        .eq('user_id', user.id);

      // Refund the credit that was debited at submission time. Idempotent:
      // we only refund once by checking for an existing refund transaction.
      await refundRenderCreditOnce(supabase, user.id, job.edit_id);

      return NextResponse.json({
        status: 'failed',
        progress: 0,
        error: shotstackStatus.error || 'Render failed',
      });
    }

    // Still in progress — update progress
    await mutationClient(supabase)
      .from('render_jobs')
      .update({
        shotstack_status: shotstackStatus.status,
        progress: shotstackStatus.progress,
      })
      .eq('id', jobId)
      .eq('user_id', user.id);

    return NextResponse.json({
      status: 'processing',
      progress: shotstackStatus.progress,
      shotstackStatus: shotstackStatus.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Status route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
