// =============================================================================
// Arrowhead 7 — Render Status Polling Route
// =============================================================================
// Client polls this to check render progress

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRenderStatus } from '@/lib/shotstack/client';
import { uploadFromUrl } from '@/lib/cloudflare/stream';
import { uploadToR2 } from '@/lib/cloudflare/r2';
import { reserveVaultKey, registerVaultFile } from '@/lib/vault';

export const dynamic = 'force-dynamic';

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

    // If already completed or failed, return cached status
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json({
        status: job.status,
        progress: job.progress,
        error: job.error_message,
      });
    }

    // Poll Shotstack
    const shotstackStatus = await getRenderStatus(job.shotstack_render_id);

    // If Shotstack is done, fan-out the output to both Cloudflare Stream
    // (for playback) and the user's vault `/exports` folder on R2.
    if (shotstackStatus.status === 'done' && shotstackStatus.url) {
      // Upload rendered video to Cloudflare Stream for playback. This is the
      // preferred playback path, but it must not turn a completed Shotstack
      // render into a failed editor flow if Stream config is missing or down.
      let streamResult: { uid: string; playbackUrl: string; thumbnailUrl: string };
      try {
        streamResult = await uploadFromUrl(shotstackStatus.url, {
          name: `edit-${job.edit_id}`,
          editId: job.edit_id,
        });
      } catch (err) {
        console.error('Cloudflare Stream upload failed; using Shotstack output URL as fallback', err);
        streamResult = {
          uid: '',
          playbackUrl: shotstackStatus.url,
          thumbnailUrl: '',
        };
      }

      // Copy to the user's vault `/exports` folder. We do this best-effort —
      // failure here shouldn't block the success response, the user can still
      // download via the Stream playback URL.
      let vaultFileId: string | null = null;
      try {
        const renderedRes = await fetch(shotstackStatus.url);
        if (renderedRes.ok && renderedRes.body) {
          const contentType =
            renderedRes.headers.get('content-type')?.split(';')[0].trim() ||
            'video/mp4';
          const ext = contentType.includes('webm') ? 'webm' : 'mp4';
          const filename = `edit-${String(job.edit_id).slice(0, 8)}.${ext}`;
          const r2Key = reserveVaultKey(user.id, 'exports', filename);

          const reader = renderedRes.body.getReader();
          const chunks: Uint8Array[] = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const buf = Buffer.concat(chunks);
          await uploadToR2(r2Key, buf, contentType);

          const file = await registerVaultFile({
            userId: user.id,
            r2Key,
            filename,
            contentType,
            sizeBytes: buf.length,
            folder: 'exports',
            source: 'render',
            editId: job.edit_id,
            thumbnailUrl: streamResult.thumbnailUrl || undefined,
            metadata: {
              shotstack_render_id: job.shotstack_render_id,
              stream_uid: streamResult.uid || undefined,
            },
          });
          vaultFileId = file?.id ?? null;
        }
      } catch (err) {
        console.error('Vault export copy failed (non-fatal)', err);
      }

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
          output_stream_uid: streamResult.uid || null,
          output_thumbnail_url: streamResult.thumbnailUrl || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.edit_id);

      return NextResponse.json({
        status: 'completed',
        progress: 100,
        playbackUrl: streamResult.playbackUrl,
        thumbnailUrl: streamResult.thumbnailUrl,
        vaultFileId,
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
