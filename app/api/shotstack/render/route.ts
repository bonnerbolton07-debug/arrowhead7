// =============================================================================
// Arrowhead 7 — Render API Route
// =============================================================================
// Triggers a Shotstack render and tracks the job

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import {
  buildTimelineFromStyleDNA,
  submitRender,
  cancelRender,
  summarizeShotstackConfig,
} from '@/lib/shotstack/client';
import { applyWatermarkIfRequired } from '@/lib/watermark/overlay';
import { rateLimitResponse } from '@/lib/rate-limit';
import { getOwnedPresignedDownloadUrl } from '@/lib/vault/ownership';
import { renderWithA7Engine } from '@/lib/a7-engine/renderer';
import {
  RENDER_ENGINE_VERSION,
  activeJobMatchesRequestedProvider,
  selectedRenderProvider,
  type RenderProvider,
} from '@/lib/render/provider';
import type { ShotstackOutput } from '@/types/edit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function resolveRenderableUrl(userId: string, value: string): Promise<string> {
  if (/^https?:\/\//i.test(value)) return value;
  return getOwnedPresignedDownloadUrl(userId, value, 6 * 3600);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function mutationClient(fallback: SupabaseServerClient): SupabaseServerClient {
  return isAdminConfigured() ? getAdminClient() as unknown as SupabaseServerClient : fallback;
}

function appendRenderEvent(
  renderConfig: unknown,
  event: Record<string, unknown>
): Record<string, unknown> {
  const base = renderConfig && typeof renderConfig === 'object'
    ? { ...(renderConfig as Record<string, unknown>) }
    : {};
  const existing = Array.isArray(base.a7_render_events)
    ? base.a7_render_events
    : [];
  base.a7_render_events = [
    ...existing.slice(-19),
    {
      at: new Date().toISOString(),
      ...event,
    },
  ];
  return base;
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
    const mutations = mutationClient(supabase);
    const body = await request.json();
    const { editId } = body;
    const renderProvider: RenderProvider = selectedRenderProvider({
      envProvider: process.env.A7_RENDER_PROVIDER,
      requestProvider: body.provider,
    });

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
      .select('id, status, progress, shotstack_render_id, render_engine')
      .eq('edit_id', editId)
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing', 'uploading'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeJob) {
      if (!activeJobMatchesRequestedProvider({
        requestedProvider: renderProvider,
        renderEngine: activeJob.render_engine,
        providerRenderId: activeJob.shotstack_render_id,
      })) {
        return NextResponse.json(
          {
            error: 'A render is already processing with a different engine. Let it finish before starting this engine test.',
            reason: 'active_render_provider_mismatch',
            activeJobId: activeJob.id,
            requestedProvider: renderProvider,
            activeEngine: activeJob.render_engine ?? 'shotstack',
          },
          { status: 409 }
        );
      }
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
        ? await resolveRenderableUrl(user.id, edit.source_video_url)
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
      const { error: persistFallbackError } = await mutations
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
      provider: renderProvider,
      fallbackConfig: startedFromFallbackConfig,
      summary: summarizeShotstackConfig(finalConfig),
    });

    let fellBackFromA7Engine = false;
    let a7EngineError: string | null = null;

    if (renderProvider !== 'shotstack') {
      try {
        const engineResult = await renderWithA7Engine({
          userId: user.id,
          editId,
          config: finalConfig,
        });
        const completedAt = new Date().toISOString();

        const { data: job, error: jobError } = await supabase
          .from('render_jobs')
          .insert({
            edit_id: editId,
            user_id: user.id,
            shotstack_render_id: engineResult.renderId,
            shotstack_status: 'done',
            render_engine: 'a7_engine',
            engine_version: RENDER_ENGINE_VERSION,
            output_r2_key: engineResult.outputKey,
            provider_fallback: false,
            diagnostics: [engineResult.report],
            status: 'completed',
            progress: 100,
            started_at: completedAt,
            completed_at: completedAt,
          })
          .select()
          .single();

        if (jobError) {
          console.error('[a7-engine/render] completed export but failed to create job row', {
            editId,
            outputKey: engineResult.outputKey,
            error: jobError.message,
          });
          await supabase.rpc('refund_credit', { p_user_id: user.id, p_amount: 1 });
          return NextResponse.json(
            {
              error: 'A7 finished the export but could not save the render job. Your credit was returned.',
              reason: 'a7_engine_job_save_failed',
            },
            { status: 500 }
          );
        }

        const { error: editUpdateError } = await mutations
          .from('edits')
          .update({
            status: 'completed',
            output_video_url: engineResult.playbackUrl,
            output_stream_uid: null,
            output_thumbnail_url: null,
            completed_at: completedAt,
            render_config: appendRenderEvent({
              ...(finalConfig as unknown as Record<string, unknown>),
              a7_engine_report: engineResult.report,
              a7_engine_output_key: engineResult.outputKey,
            }, {
              stage: 'completed',
              provider: 'a7_engine',
              renderId: engineResult.renderId,
              outputKey: engineResult.outputKey,
              vaultFileId: engineResult.vaultFileId,
              clipsRendered: engineResult.report.clipsRendered,
              durationSeconds: engineResult.report.durationSeconds,
            }),
          })
          .eq('id', editId)
          .eq('user_id', user.id);
        if (editUpdateError) {
          console.error('[a7-engine/render] completed export but failed to update edit row', {
            editId,
            jobId: job.id,
            outputKey: engineResult.outputKey,
            error: editUpdateError.message,
          });
          await mutations
            .from('render_jobs')
            .update({
              status: 'failed',
              error_message: 'A7 finished the export but could not attach it to the edit.',
            })
            .eq('id', job.id)
            .eq('user_id', user.id);
          await supabase.rpc('refund_credit', { p_user_id: user.id, p_amount: 1 });
          return NextResponse.json(
            {
              error: 'A7 finished the export but could not attach it to the edit. Your credit was returned.',
              reason: 'a7_engine_edit_save_failed',
            },
            { status: 500 }
          );
        }

        const { error: txError } = await supabase.from('credit_transactions').insert({
          user_id: user.id,
          amount: -1,
          balance_after: newBalance,
          reason: 'render',
          reference_id: editId,
        });
        if (txError) {
          console.error('[a7-engine/render] credit_transactions insert failed', {
            userId: user.id,
            amount: -1,
            balanceAfter: newBalance,
            editId,
            error: txError.message,
          });
        }

        console.info('[a7-engine/render] render job completed', {
          editId,
          jobId: job.id,
          clipsRendered: engineResult.report.clipsRendered,
          durationSeconds: engineResult.report.durationSeconds,
        });

        return NextResponse.json({
          jobId: job.id,
          renderId: engineResult.renderId,
          status: 'completed',
          progress: 100,
          playbackUrl: engineResult.playbackUrl,
          vaultFileId: engineResult.vaultFileId,
          outputKey: engineResult.outputKey,
          engine: 'a7_engine',
          engineVersion: RENDER_ENGINE_VERSION,
          fallback: startedFromFallbackConfig,
          report: engineResult.report,
        });
      } catch (engineError) {
        console.error('[a7-engine/render] native render failed', {
          editId,
          provider: renderProvider,
          error: errorMessage(engineError).slice(0, 1000),
        });
        a7EngineError = errorMessage(engineError);
        if (renderProvider === 'a7_engine') {
          await supabase.rpc('refund_credit', { p_user_id: user.id, p_amount: 1 });
          await mutations
            .from('edits')
            .update({
              status: 'failed',
              render_config: appendRenderEvent(finalConfig, {
                stage: 'failed',
                provider: 'a7_engine',
                reason: 'a7_engine_failed',
                error: errorMessage(engineError).slice(0, 500),
              }),
            })
            .eq('id', editId)
            .eq('user_id', user.id);
          return NextResponse.json(
            {
              error: 'A7 native render failed. Your credit was returned.',
              reason: 'a7_engine_failed',
              detail: errorMessage(engineError).slice(0, 240),
            },
            { status: 502 }
          );
        }
        fellBackFromA7Engine = true;
        await mutations
          .from('edits')
          .update({
            render_config: appendRenderEvent(finalConfig, {
              stage: 'fallback',
              from: 'a7_engine',
              to: 'shotstack',
              error: a7EngineError?.slice(0, 500),
            }),
          })
          .eq('id', editId)
          .eq('user_id', user.id);
        console.warn('[a7-engine/render] auto provider falling back to Shotstack', {
          editId,
          error: a7EngineError?.slice(0, 500),
        });
      }
    }

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
          ? await resolveRenderableUrl(user.id, edit.source_video_url)
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
        await mutations
          .from('edits')
          .update({
            render_config: appendRenderEvent(fallbackConfig, {
              stage: 'shotstack_minimal_fallback',
              reason: 'primary_provider_submit_failed',
              primaryError: errorMessage(renderError).slice(0, 500),
            }),
          })
          .eq('id', editId)
          .eq('user_id', user.id);
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
        await mutations
          .from('edits')
          .update({
            status: 'failed',
            render_config: appendRenderEvent(finalConfig, {
              stage: 'failed',
              provider: 'shotstack',
              reason: 'provider_submit_failed',
              primaryError: primary.slice(0, 500),
              fallbackError: fallback.slice(0, 500),
            }),
          })
          .eq('id', editId)
          .eq('user_id', user.id);
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
        render_engine: 'shotstack',
        engine_version: 'shotstack',
        provider_fallback: fellBackFromA7Engine,
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
    const { error: renderStatusError } = await mutations
      .from('edits')
      .update({ status: 'rendering' })
      .eq('id', editId)
      .eq('user_id', user.id);
    if (renderStatusError) {
      console.error('[shotstack/render] failed to mark edit rendering', {
        editId,
        jobId: job.id,
        error: renderStatusError.message,
      });
    }

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
      providerFallback: fellBackFromA7Engine,
    });

    return NextResponse.json({
      jobId: job.id,
      shotstackRenderId,
      status: 'processing',
      engine: 'shotstack',
      engineVersion: 'shotstack',
      fallback: usedFallbackRender || startedFromFallbackConfig,
      providerFallback: fellBackFromA7Engine,
      warning: fellBackFromA7Engine
        ? 'A7 Engine failed in auto mode, so Shotstack fallback took over. Founder test should inspect the native engine error.'
        : undefined,
      engineError: fellBackFromA7Engine ? a7EngineError?.slice(0, 240) : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Render route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
