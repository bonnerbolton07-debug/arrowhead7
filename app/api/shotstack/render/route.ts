// =============================================================================
// Arrowhead 7 — Render API Route
// =============================================================================
// Triggers a Shotstack render and tracks the job

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { submitRender } from '@/lib/shotstack/client';

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

    // Check credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits_remaining')
      .eq('id', user.id)
      .single();

    if (!profile || profile.credits_remaining < 1) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // Submit to Shotstack
    const shotstackRenderId = await submitRender(edit.render_config);

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
      return NextResponse.json({ error: 'Failed to create render job' }, { status: 500 });
    }

    // Update edit status
    await supabase
      .from('edits')
      .update({ status: 'rendering' })
      .eq('id', editId);

    // Deduct credit
    await supabase
      .from('profiles')
      .update({
        credits_remaining: profile.credits_remaining - 1,
        credits_used_total: (profile as any).credits_used_total + 1,
      })
      .eq('id', user.id);

    // Log credit transaction
    await supabase.from('credit_transactions').insert({
      user_id: user.id,
      amount: -1,
      balance_after: profile.credits_remaining - 1,
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
