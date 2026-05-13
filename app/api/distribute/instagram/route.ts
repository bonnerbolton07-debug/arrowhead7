// =============================================================================
// Arrowhead 7 — Instagram: Distribute (Reels)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getValidInstagramAccess,
  publishInstagramReel,
} from '@/lib/distribute/instagram';
import { resolveSourceVideoUrl } from '@/lib/distribute/source';
import { formatCaption } from '@/lib/distribute/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const {
      editId,
      channelId,
      caption,
      hashtags,
      thumbnailUrl,
      scheduledFor,
    } = body as {
      editId: string;
      channelId: string;
      caption: string;
      hashtags?: string[];
      thumbnailUrl?: string;
      scheduledFor?: string;
    };

    if (!editId || !channelId || !caption) {
      return NextResponse.json(
        { error: 'Missing editId, channelId, or caption' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: edit } = await supabase
      .from('edits')
      .select('*')
      .eq('id', editId)
      .eq('user_id', user.id)
      .single();
    if (!edit) {
      return NextResponse.json({ error: 'Edit not found' }, { status: 404 });
    }

    const sourceUrl = await resolveSourceVideoUrl(edit);
    if (!sourceUrl) {
      return NextResponse.json(
        { error: 'No video available for this edit' },
        { status: 409 }
      );
    }

    const fullCaption = formatCaption('instagram', caption, hashtags ?? []);

    if (scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 60_000) {
      const { data: dist } = await supabase
        .from('distributions')
        .insert({
          edit_id: editId,
          channel_id: channelId,
          user_id: user.id,
          title: caption.slice(0, 120),
          description: fullCaption,
          tags: hashtags ?? [],
          thumbnail_url: thumbnailUrl ?? null,
          platform: 'instagram',
          status: 'scheduled',
          scheduled_for: scheduledFor,
        })
        .select()
        .single();
      return NextResponse.json({ distribution: dist, status: 'scheduled' });
    }

    const { data: dist, error: distErr } = await supabase
      .from('distributions')
      .insert({
        edit_id: editId,
        channel_id: channelId,
        user_id: user.id,
        title: caption.slice(0, 120),
        description: fullCaption,
        tags: hashtags ?? [],
        thumbnail_url: thumbnailUrl ?? null,
        platform: 'instagram',
        status: 'publishing',
        publish_attempts: 1,
      })
      .select()
      .single();
    if (distErr || !dist) {
      return NextResponse.json(
        { error: distErr?.message ?? 'failed to create distribution' },
        { status: 500 }
      );
    }

    try {
      const { pageAccessToken, igUserId } = await getValidInstagramAccess(
        user.id,
        channelId
      );
      const result = await publishInstagramReel({
        pageAccessToken,
        igUserId,
        videoUrl: sourceUrl,
        caption: fullCaption,
        thumbnailUrl,
      });

      await supabase
        .from('distributions')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: result.mediaId,
          platform_url: result.permalink ?? null,
        })
        .eq('id', dist.id);

      return NextResponse.json({
        distributionId: dist.id,
        mediaId: result.mediaId,
        permalink: result.permalink,
        status: 'published',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'publish_failed';
      await supabase
        .from('distributions')
        .update({ status: 'failed', last_error: msg })
        .eq('id', dist.id);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Instagram distribute error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
