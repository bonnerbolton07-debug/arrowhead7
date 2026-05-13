// =============================================================================
// Arrowhead 7 — Render API Route
// =============================================================================
// Triggers a Shotstack render and tracks the job

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { submitRender } from '@/lib/shotstack/client';
import { getPresignedDownloadUrl } from '@/lib/cloudflare/r2';
import type { ShotstackRenderConfig } from '@/types/edit';

export const dynamic = 'force-dynamic';

// Shotstack needs fetchable URLs. The editor stores R2 keys (e.g.
// "sources/uid/eid/source.mp4") so we presign them before submitting.
async function hydrateAssetSources(
  config: ShotstackRenderConfig
): Promise<ShotstackRenderConfig> {
  const presignCache = new Map<string, string>();
  const presign = async (key: string) => {
    if (presignCache.has(key)) return presignCache.get(key)!;
    const url = await getPresignedDownloadUrl(key, 6 * 3600);
    presignCache.set(key, url);
    return url;
  };

  const isUrl = (s: string) => /^https?:\/\//i.test(s);

  const tracks = await Promise.all(
    config.timeline.tracks.map(async (track) => ({
      clips: await Promise.all(
        track.clips.map(async (clip) => {
          const src = clip.asset?.src;
          if (typeof src === 'string' && src && !isUrl(src)) {
            return { ...clip, asset: { ...clip.asset, src: await presign(src) } };
          }
          return clip;
        })
      ),
    }))
  );

  let soundtrack = config.timeline.soundtrack;
  if (soundtrack?.src && !isUrl(soundtrack.src)) {
    soundtrack = { ...soundtrack, src: await presign(soundtrack.src) };
  }

  return {
    ...config,
    timeline: { ...config.timeline, tracks, soundtrack },
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
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

    // Submit to Shotstack — hydrate any R2 keys into presigned URLs first
    let shotstackRenderId: string;
    try {
      const hydratedConfig = await hydrateAssetSources(edit.render_config);
      shotstackRenderId = await submitRender(hydratedConfig);
    } catch (renderError) {
      // Refund the credit if the upstream submit fails
      await supabase.rpc('refund_credit', { p_user_id: user.id, p_amount: 1 });
      console.error('Shotstack submit failed:', renderError);
      return NextResponse.json({ error: 'Render submission failed' }, { status: 502 });
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

    // Log credit transaction
    await supabase.from('credit_transactions').insert({
      user_id: user.id,
      amount: -1,
      balance_after: newBalance,
      reason: 'render',
      reference_id: editId,
    });

    return NextResponse.json({
      jobId: job.id,
      shotstackRenderId,
      status: 'processing',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Render route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
