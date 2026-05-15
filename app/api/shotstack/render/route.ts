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
  cancelRender,
  summarizeShotstackConfig,
} from '@/lib/shotstack/client';
import { applyWatermarkIfRequired } from '@/lib/watermark/overlay';
import { rateLimitResponse } from '@/lib/rate-limit';
import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';
import type { ShotstackOutput } from '@/types/edit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

function firstVideoAssetUrl(config: { timeline?: { tracks?: Array<{ clips?: Array<{ asset?: { type?: string; src?: string } }> }> } }) {
  for (const track of config.timeline?.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      if (clip.asset?.type === 'video' && clip.asset.src) return clip.asset.src;
    }
  }
  return null;
}

function buildFallbackConfig(
  sourceUrl: string,
  options?: {
    duration?: number;
    format?: ShotstackOutput['format'];
    resolution?: ShotstackOutput['resolution'];
    fps?: number;
  }
) {
  return buildTimelineFromStyleDNA(sourceUrl, null, {
    targetDuration: Math.max(5, Math.min(30, Math.ceil(options?.duration || 15))),
    outputFormat: videoOutputFormat(options?.format ?? 'mp4'),
    outputResolution: options?.resolution ?? '1080',
    outputFps: options?.fps ?? 30,
  });
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

    let renderConfig = edit.render_config;
    let startedFromFallbackConfig = false;
    if (!renderConfig) {
      const fallbackSourceUrl = edit.source_video_url
        ? await resolveRenderableUrl(edit.source_video_url)
        : null;
      if (!fallbackSourceUrl) {
        console.warn('[shotstack/render] missing render config and source footage', {
          editId,
        });
        return NextResponse.json(
          { error: 'A7 could not find a render plan or source video. Go back to Source Media and add one video clip.' },
          { status: 400 }
        );
      }
      renderConfig = buildFallbackConfig(fallbackSourceUrl);
      startedFromFallbackConfig = true;
      const { error: persistFallbackError } = await supabase
        .from('edits')
        .update({ render_config: renderConfig, status: 'ready' })
        .eq('id', editId)
        .eq('user_id', user.id);
      if (persistFallbackError) {
        console.error('[shotstack/render] failed to persist fallback render config', {
          editId,
          error: persistFallbackError.message,
        });
      }
    }

    const finalConfig = applyWatermarkIfRequired(
      renderConfig,
      profile?.subscription_tier ?? null
    );
    console.info('[shotstack/render] submitting render', {
      editId,
      fallbackConfig: startedFromFallbackConfig,
      summary: summarizeShotstackConfig(finalConfig),
    });

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
        const sourceUrl = edit.source_video_url
          ? await resolveRenderableUrl(edit.source_video_url)
          : firstVideoAssetUrl(finalConfig);
        if (!sourceUrl) throw new Error('Edit has no renderable video source for fallback render');
        const fallbackConfig = applyWatermarkIfRequired(
          buildFallbackConfig(sourceUrl, {
            duration: summarizeShotstackConfig(finalConfig).duration,
            format: finalConfig.output.format,
            resolution: finalConfig.output.resolution,
            fps: finalConfig.output.fps,
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
            error: 'Render submission failed. Your credit was returned. A7 could not submit the media to the render provider.',
            reason: 'provider_submit_failed',
            detail: fallback.slice(0, 240),
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
      // The render was accepted by Shotstack but we have no render_jobs row to
      // poll it from — it would run to completion, billable, fully orphaned.
      // Cancel it upstream (best-effort: a render already past `queued` can't
      // be stopped), then refund the credit and surface the failure.
      try {
        await cancelRender(shotstackRenderId);
      } catch (cancelError) {
        console.error('[shotstack/render] failed to cancel orphaned render', {
          editId,
          shotstackRenderId,
          error: errorMessage(cancelError).slice(0, 500),
        });
      }
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

    console.info('[shotstack/render] render job created', {
      editId,
      jobId: job.id,
      fallback: usedFallbackRender || startedFromFallbackConfig,
    });

    return NextResponse.json({
      jobId: job.id,
      shotstackRenderId,
      status: 'processing',
      fallback: usedFallbackRender || startedFromFallbackConfig,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Render route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
