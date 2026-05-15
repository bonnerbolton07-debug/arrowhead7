// =============================================================================
// Arrowhead 7 — Render Status Polling Route
// =============================================================================
// Client polls this to check render progress

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRenderStatus } from '@/lib/shotstack/client';
import { uploadFromUrl } from '@/lib/cloudflare/stream';

export const dynamic = 'force-dynamic';
const STREAM_COPY_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer!));
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
        .select('output_video_url, output_thumbnail_url, output_stream_uid')
        .eq('id', job.edit_id)
        .eq('user_id', user.id)
        .maybeSingle();
      return NextResponse.json({
        status: job.status,
        progress: job.progress,
        error: job.error_message,
        playbackUrl: edit?.output_video_url ?? null,
        thumbnailUrl: edit?.output_thumbnail_url ?? null,
        streamUid: edit?.output_stream_uid ?? null,
      });
    }

    // Poll Shotstack
    const shotstackStatus = await getRenderStatus(job.shotstack_render_id);

    // If Shotstack is done, mark the edit completed immediately with the
    // Shotstack output URL. Any secondary hosting must never block completion.
    if (shotstackStatus.status === 'done' && shotstackStatus.url) {
      const completedAt = new Date().toISOString();
      let playbackUrl = shotstackStatus.url;
      let thumbnailUrl = '';
      let streamUid = '';

      await supabase
        .from('render_jobs')
        .update({
          status: 'completed',
          progress: 100,
          completed_at: completedAt,
        })
        .eq('id', jobId);

      await supabase
        .from('edits')
        .update({
          status: 'completed',
          output_video_url: playbackUrl,
          output_stream_uid: null,
          output_thumbnail_url: null,
          completed_at: completedAt,
        })
        .eq('id', job.edit_id);

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
        await supabase
          .from('edits')
          .update({
            output_stream_uid: streamUid,
            output_thumbnail_url: thumbnailUrl,
          })
          .eq('id', job.edit_id);
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
      await supabase
        .from('render_jobs')
        .update({
          status: 'failed',
          error_message: shotstackStatus.error || 'Render failed',
        })
        .eq('id', jobId);

      await supabase
        .from('edits')
        .update({ status: 'failed' })
        .eq('id', job.edit_id);

      // Refund the credit that was debited at submission time. Idempotent:
      // we only refund once by checking for an existing refund transaction.
      const { data: existingRefund } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('reason', 'refund')
        .eq('reference_id', job.edit_id)
        .maybeSingle();

      if (!existingRefund) {
        const { data: refunded } = await supabase.rpc('refund_credit', {
          p_user_id: user.id,
          p_amount: 1,
        });
        const newBalance = refunded?.[0]?.credits_remaining;
        if (typeof newBalance === 'number') {
          await supabase.from('credit_transactions').insert({
            user_id: user.id,
            amount: 1,
            balance_after: newBalance,
            reason: 'refund',
            reference_id: job.edit_id,
          });
        }
      }

      return NextResponse.json({
        status: 'failed',
        progress: 0,
        error: shotstackStatus.error || 'Render failed',
      });
    }

    // Still in progress — update progress
    await supabase
      .from('render_jobs')
      .update({
        shotstack_status: shotstackStatus.status,
        progress: shotstackStatus.progress,
      })
      .eq('id', jobId);

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
