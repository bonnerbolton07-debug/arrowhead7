// =============================================================================
// Arrowhead 7 — TikTok: Distribute
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getValidTikTokAccessToken,
  postTikTokFromUrl,
} from '@/lib/distribute/tiktok';
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
      privacy,
      disableComment,
      disableDuet,
      disableStitch,
      scheduledFor,
    } = body as {
      editId: string;
      channelId: string;
      caption: string;
      hashtags?: string[];
      privacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
      disableComment?: boolean;
      disableDuet?: boolean;
      disableStitch?: boolean;
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

    const title = formatCaption('tiktok', caption, hashtags ?? []);

    if (scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 60_000) {
      const { data: dist } = await supabase
        .from('distributions')
        .insert({
          edit_id: editId,
          channel_id: channelId,
          user_id: user.id,
          title,
          description: caption,
          tags: hashtags ?? [],
          platform: 'tiktok',
          status: 'scheduled',
          scheduled_for: scheduledFor,
          platform_metadata: { privacy, disableComment, disableDuet, disableStitch },
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
        title,
        description: caption,
        tags: hashtags ?? [],
        platform: 'tiktok',
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
      const accessToken = await getValidTikTokAccessToken(user.id, channelId);
      const { publishId } = await postTikTokFromUrl({
        accessToken,
        videoUrl: sourceUrl,
        title,
        privacy,
        disableComment,
        disableDuet,
        disableStitch,
      });

      await supabase
        .from('distributions')
        .update({
          status: 'publishing',
          upload_id: publishId,
          platform_metadata: { publish_id: publishId },
        })
        .eq('id', dist.id);

      return NextResponse.json({
        distributionId: dist.id,
        publishId,
        status: 'publishing',
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
    console.error('TikTok distribute error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
