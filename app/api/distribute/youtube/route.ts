// =============================================================================
// Arrowhead 7 — YouTube: Distribute
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getValidYouTubeAccessToken,
  uploadYouTubeVideo,
  setYouTubeThumbnail,
} from '@/lib/distribute/youtube';
import { resolveSourceVideoUrl } from '@/lib/distribute/source';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const {
      editId,
      channelId,
      title,
      description,
      tags,
      privacyStatus,
      thumbnailUrl,
      categoryId,
      scheduledFor,
    } = body as {
      editId: string;
      channelId: string;
      title: string;
      description?: string;
      tags?: string[];
      privacyStatus?: 'public' | 'unlisted' | 'private';
      thumbnailUrl?: string;
      categoryId?: string;
      scheduledFor?: string;
    };

    if (!editId || !channelId || !title) {
      return NextResponse.json(
        { error: 'Missing editId, channelId, or title' },
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
        { error: 'No published video available for this edit' },
        { status: 409 }
      );
    }

    // Defer if scheduled
    if (scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 60_000) {
      const { data: dist } = await supabase
        .from('distributions')
        .insert({
          edit_id: editId,
          channel_id: channelId,
          user_id: user.id,
          title,
          description: description ?? '',
          tags: tags ?? [],
          thumbnail_url: thumbnailUrl ?? null,
          platform: 'youtube',
          status: 'scheduled',
          scheduled_for: scheduledFor,
          platform_metadata: { privacyStatus, categoryId },
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
        description: description ?? '',
        tags: tags ?? [],
        thumbnail_url: thumbnailUrl ?? null,
        platform: 'youtube',
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
      const accessToken = await getValidYouTubeAccessToken(user.id, channelId);
      const result = await uploadYouTubeVideo({
        accessToken,
        videoUrl: sourceUrl,
        title,
        description,
        tags,
        categoryId,
        privacyStatus,
      });

      if (thumbnailUrl) {
        await setYouTubeThumbnail({
          accessToken,
          videoId: result.videoId,
          thumbnailUrl,
        });
      }

      const platformUrl = `https://www.youtube.com/watch?v=${result.videoId}`;
      await supabase
        .from('distributions')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: result.videoId,
          platform_url: platformUrl,
          platform_metadata: {
            uploadStatus: result.uploadStatus,
            privacyStatus: result.privacyStatus,
          },
        })
        .eq('id', dist.id);

      return NextResponse.json({
        distributionId: dist.id,
        videoId: result.videoId,
        platformUrl,
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
    console.error('YouTube distribute error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
