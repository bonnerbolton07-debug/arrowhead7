// =============================================================================
// Arrowhead 7 — Render Status Polling Route
// =============================================================================
// Client polls this to check render progress

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRenderStatus } from '@/lib/shotstack/client';
import { uploadFromUrl } from '@/lib/cloudflare/stream';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Query = z.object({
  jobId: z.string().regex(UUID_RE, 'Invalid jobId'),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();
    const parsed = Query.safeParse({ jobId: request.nextUrl.searchParams.get('jobId') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { jobId } = parsed.data;

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

    // If already completed or failed, return cached status
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json({
        status: job.status,
        progress: job.progress,
        error: job.error_message,
      });
    }

    if (!job.shotstack_render_id) {
      return NextResponse.json(
        { error: 'Job not yet submitted to renderer' },
        { status: 409 }
      );
    }

    // Poll Shotstack
    const shotstackStatus = await getRenderStatus(job.shotstack_render_id);

    // If Shotstack is done, upload to Cloudflare Stream
    if (shotstackStatus.status === 'done' && shotstackStatus.url) {
      // Upload rendered video to Cloudflare Stream
      const streamResult = await uploadFromUrl(shotstackStatus.url, {
        name: `edit-${job.edit_id}`,
        editId: job.edit_id,
      });

      // Update render job
      await supabase
        .from('render_jobs')
        .update({
          status: 'completed',
          progress: 100,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      // Update edit with output URLs
      await supabase
        .from('edits')
        .update({
          status: 'completed',
          output_video_url: streamResult.playbackUrl,
          output_stream_uid: streamResult.uid,
          output_thumbnail_url: streamResult.thumbnailUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.edit_id);

      return NextResponse.json({
        status: 'completed',
        progress: 100,
        playbackUrl: streamResult.playbackUrl,
        thumbnailUrl: streamResult.thumbnailUrl,
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
