// =============================================================================
// Arrowhead 7 — Render API Route
// =============================================================================
// Triggers a Shotstack render and tracks the job

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  buildTimelineFromStyleDNA,
  submitRender,
  summarizeShotstackConfig,
} from '@/lib/shotstack/client';
import { applyWatermarkIfRequired } from '@/lib/watermark/overlay';
import { rateLimitResponse } from '@/lib/rate-limit';
import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';
import type { ShotstackOutput } from '@/types/edit';

export const dynamic = 'force-dynamic';

async function resolveRenderableUrl(value: string): Promise<string> {
  if (/^https?:\/\//i.test(value)) return value;
  return getPresignedDownloadUrl(value, 6 * 3600);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function videoOutputFormat(format: ShotstackOutput['format']): 'mp4' | 'webm' | 'gif' {
  return format === 'webm' || format === 'gif' ? format : 'mp4';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const limited = rateLimitResponse('shotstack-render', user.id);
    if (limited) return limited;

    const supabase = await createServerSupabaseClient();
    const { editId } = await request.json();

    if (!editId) {
      return NextResponse.json({ error: 'Missing editId' }, { status: 400 });
    }

    // Fetch the edit
    const { data: edit, error: editError } = await supabase
      .from('edits')
      .select('*')
      .eq('id', editId)
      .eq('user_id', user.id)
      .single();

    if (editError || !edit) {
      return NextResponse.json({ error: 'Edit not found' }, { status: 404 });
    }

    if (!edit.render_config) {
      return NextResponse.json({ error: 'Edit has no render config' }, { status: 400 });
    }

    const { data: activeJob } = await supabase
      .from('render_jobs')
      .select('id, status, progress')
      .eq('edit_id', editId)
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing', 'uploading'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeJob) {
      return NextResponse.json({
        jobId: activeJob.id,
        status: 'processing',
        progress: activeJob.progress ?? 0,
        duplicate: true,
      });
    }

    // Atomically deduct credit only if balance >= 1. This avoids the
    // check-then-deduct race where two concurrent renders both pass the
    // check and both decrement, taking the balance negative.
    const { data: debited, error: debitError } = await supabase.rpc(
      'debit_credit',
      { p_user_id: user.id, p_amount: 1 }
    );

    if (debitError) {
      console.error('Credit debit RPC failed:', debitError);
      return NextResponse.json({ error: 'Failed to debit credits' }, { status: 500 });
    }

    if (!debited || debited.length === 0) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const newBalance = debited[0].credits_remaining as number;

    // Look up subscription tier so we can stamp the free-tier watermark.
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const finalConfig = applyWatermarkIfRequired(
      edit.render_config,
      profile?.subscription_tier ?? null
    );

    // Submit to Shotstack. If the rich Style DNA timeline is rejected upstream,
    // fall back to a minimal source-video render so the creator still gets an
    // output instead of a hard failure.
    let shotstackRenderId: string;
    let usedFallbackRender = false;
    try {
      shotstackRenderId = await submitRender(finalConfig);
    } catch (renderError) {
      console.error('[shotstack/render] primary submit failed; attempting minimal fallback', {
        editId,
        primaryConfig: summarizeShotstackConfig(finalConfig),
        error: errorMessage(renderError).slice(0, 1000),
      });

      try {
        if (!edit.source_video_url) throw new Error('Edit has no source_video_url for fallback render');
        const sourceUrl = await resolveRenderableUrl(edit.source_video_url);
        const fallbackConfig = applyWatermarkIfRequired(
          buildTimelineFromStyleDNA(sourceUrl, null, {
            targetDuration: Math.max(
              5,
              Math.min(
                30,
                Math.ceil(summarizeShotstackConfig(finalConfig).duration || 15)
              )
            ),
            outputFormat: videoOutputFormat(finalConfig.output.format),
            outputResolution: finalConfig.output.resolution,
            outputFps: finalConfig.output.fps,
          }),
          profile?.subscription_tier ?? null
        );
        shotstackRenderId = await submitRender(fallbackConfig);
        usedFallbackRender = true;
        await supabase
          .from('edits')
          .update({ render_config: fallbackConfig })
          .eq('id', editId);
      } catch (fallbackError) {
        // Refund the credit if both upstream submits fail.
        await supabase.rpc('refund_credit', { p_user_id: user.id, p_amount: 1 });
        const primary = errorMessage(renderError);
        const fallback = errorMessage(fallbackError);
        console.error('[shotstack/render] primary and fallback submit failed', {
          editId,
          primary: primary.slice(0, 1000),
          fallback: fallback.slice(0, 1000),
        });
        return NextResponse.json(
          {
            error: 'Render submission failed. Your credit was returned. Try a shorter clip or fewer media layers.',
          },
          { status: 502 }
        );
      }
    }

    // Create render job record
    const { data: job, error: jobError } = await supabase
      .from('render_jobs')
      .insert({
        edit_id: editId,
        user_id: user.id,
        shotstack_render_id: shotstackRenderId,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      console.error('Failed to create render job:', jobError);
      // Refund: render submitted upstream but we can't track it
      await supabase.rpc('refund_credit', { p_user_id: user.id, p_amount: 1 });
      return NextResponse.json({ error: 'Failed to create render job' }, { status: 500 });
    }

    // Update edit status
    await supabase
      .from('edits')
      .update({ status: 'rendering' })
      .eq('id', editId);

    // Log credit transaction. Failure here doesn't block the response — the
    // credit has already been debited atomically — but we surface it so we
    // can spot a broken audit trail.
    const { error: txError } = await supabase.from('credit_transactions').insert({
      user_id: user.id,
      amount: -1,
      balance_after: newBalance,
      reason: 'render',
      reference_id: editId,
    });
    if (txError) {
      console.error('[shotstack/render] credit_transactions insert failed', {
        userId: user.id,
        amount: -1,
        balanceAfter: newBalance,
        editId,
        error: txError.message,
      });
    }

    return NextResponse.json({
      jobId: job.id,
      shotstackRenderId,
      status: 'processing',
      fallback: usedFallbackRender,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Render route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
