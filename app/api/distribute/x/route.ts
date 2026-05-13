// =============================================================================
// Arrowhead 7 — X (Twitter): Distribute
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getValidXAccessToken,
  uploadXVideo,
  postXTweet,
} from '@/lib/distribute/x';
import { resolveSourceVideoUrl } from '@/lib/distribute/source';
import { formatCaption } from '@/lib/distribute/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { editId, channelId, text, hashtags, scheduledFor } = body as {
      editId: string;
      channelId: string;
      text: string;
      hashtags?: string[];
      scheduledFor?: string;
    };

    if (!editId || !channelId || !text) {
      return NextResponse.json(
        { error: 'Missing editId, channelId, or text' },
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

    const tweetText = formatCaption('twitter', text, hashtags ?? []);

    if (scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 60_000) {
      const { data: dist } = await supabase
        .from('distributions')
        .insert({
          edit_id: editId,
          channel_id: channelId,
          user_id: user.id,
          title: tweetText.slice(0, 120),
          description: tweetText,
          tags: hashtags ?? [],
          platform: 'twitter',
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
        title: tweetText.slice(0, 120),
        description: tweetText,
        tags: hashtags ?? [],
        platform: 'twitter',
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
      const accessToken = await getValidXAccessToken(user.id, channelId);
      const mediaId = await uploadXVideo({ accessToken, videoUrl: sourceUrl });
      const tweet = await postXTweet({
        accessToken,
        text: tweetText,
        mediaIds: [mediaId],
      });

      await supabase
        .from('distributions')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: tweet.tweetId,
          platform_url: tweet.url,
          platform_metadata: { media_id: mediaId },
        })
        .eq('id', dist.id);

      return NextResponse.json({
        distributionId: dist.id,
        tweetId: tweet.tweetId,
        url: tweet.url,
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
    console.error('X distribute error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
