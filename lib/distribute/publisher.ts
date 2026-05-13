// =============================================================================
// Arrowhead 7 — Unified Publisher
// =============================================================================
// Single dispatch point for all platforms. Called by /api/distribute/multi
// and the scheduler cron.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveSourceVideoUrl } from '@/lib/distribute/source';
import { formatCaption } from '@/lib/distribute/format';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getValidYouTubeAccessToken,
  uploadYouTubeVideo,
  setYouTubeThumbnail,
} from '@/lib/distribute/youtube';
import {
  getValidTikTokAccessToken,
  postTikTokFromUrl,
} from '@/lib/distribute/tiktok';
import {
  getValidInstagramAccess,
  publishInstagramReel,
} from '@/lib/distribute/instagram';
import {
  getValidXAccessToken,
  uploadXVideo,
  postXTweet,
} from '@/lib/distribute/x';

export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'twitter';

export interface PublishContent {
  title: string;
  description?: string;
  hashtags?: string[];
  thumbnailUrl?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  categoryId?: string;
  tiktokPrivacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export interface PublishOutcome {
  platform: Platform;
  channelId: string;
  distributionId: string;
  status: 'published' | 'publishing' | 'failed';
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
}

interface EditRow {
  id: string;
  output_video_url?: string | null;
  output_stream_uid?: string | null;
  source_video_url?: string | null;
}

async function db(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? ((await createServerSupabaseClient()) as unknown as SupabaseClient);
}

async function loadEdit(
  userId: string,
  editId: string,
  client?: SupabaseClient
): Promise<EditRow | null> {
  const supabase = await db(client);
  const { data } = await supabase
    .from('edits')
    .select('id, output_video_url, output_stream_uid, source_video_url')
    .eq('id', editId)
    .eq('user_id', userId)
    .single();
  return data;
}

async function createDistribution(
  opts: {
    userId: string;
    editId: string;
    channelId: string;
    platform: Platform;
    title: string;
    description: string;
    tags: string[];
    thumbnailUrl?: string;
    metadata?: Record<string, unknown>;
  },
  client?: SupabaseClient
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from('distributions')
    .insert({
      edit_id: opts.editId,
      channel_id: opts.channelId,
      user_id: opts.userId,
      title: opts.title,
      description: opts.description,
      tags: opts.tags,
      thumbnail_url: opts.thumbnailUrl ?? null,
      platform: opts.platform,
      status: 'publishing',
      publish_attempts: 1,
      platform_metadata: opts.metadata ?? null,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Failed to create distribution: ${error?.message ?? 'unknown'}`);
  }
  return data.id;
}

async function markDistribution(
  distributionId: string,
  patch: Record<string, unknown>,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await db(client);
  await supabase.from('distributions').update(patch).eq('id', distributionId);
}

export async function publishToChannel(opts: {
  userId: string;
  editId: string;
  channelId: string;
  platform: Platform;
  content: PublishContent;
  existingDistributionId?: string;
  client?: SupabaseClient;
}): Promise<PublishOutcome> {
  const { userId, editId, channelId, platform, content, client } = opts;

  const edit = await loadEdit(userId, editId, client);
  if (!edit) {
    return {
      platform,
      channelId,
      distributionId: opts.existingDistributionId ?? '',
      status: 'failed',
      error: 'edit_not_found',
    };
  }
  const sourceUrl = await resolveSourceVideoUrl(edit);
  if (!sourceUrl) {
    return {
      platform,
      channelId,
      distributionId: opts.existingDistributionId ?? '',
      status: 'failed',
      error: 'no_video_available',
    };
  }

  const formattedCaption = formatCaption(
    platform,
    content.description ?? content.title,
    content.hashtags ?? []
  );

  let distributionId = opts.existingDistributionId ?? '';
  if (!distributionId) {
    distributionId = await createDistribution(
      {
        userId,
        editId,
        channelId,
        platform,
        title: content.title.slice(0, 120),
        description: formattedCaption,
        tags: content.hashtags ?? [],
        thumbnailUrl: content.thumbnailUrl,
      },
      client
    );
  } else {
    await markDistribution(
      distributionId,
      { status: 'publishing', publish_attempts: 1 },
      client
    );
  }

  try {
    switch (platform) {
      case 'youtube': {
        const token = await getValidYouTubeAccessToken(userId, channelId, client);
        const result = await uploadYouTubeVideo({
          accessToken: token,
          videoUrl: sourceUrl,
          title: content.title,
          description: content.description,
          tags: content.hashtags,
          categoryId: content.categoryId,
          privacyStatus: content.privacyStatus,
        });
        if (content.thumbnailUrl) {
          await setYouTubeThumbnail({
            accessToken: token,
            videoId: result.videoId,
            thumbnailUrl: content.thumbnailUrl,
          });
        }
        const url = `https://www.youtube.com/watch?v=${result.videoId}`;
        await markDistribution(
          distributionId,
          {
            status: 'published',
            published_at: new Date().toISOString(),
            platform_post_id: result.videoId,
            platform_url: url,
            platform_metadata: {
              uploadStatus: result.uploadStatus,
              privacyStatus: result.privacyStatus,
            },
          },
          client
        );
        return {
          platform,
          channelId,
          distributionId,
          status: 'published',
          platformPostId: result.videoId,
          platformUrl: url,
        };
      }

      case 'tiktok': {
        const token = await getValidTikTokAccessToken(userId, channelId, client);
        const { publishId } = await postTikTokFromUrl({
          accessToken: token,
          videoUrl: sourceUrl,
          title: formattedCaption,
          privacy: content.tiktokPrivacy,
          disableComment: content.disableComment,
          disableDuet: content.disableDuet,
          disableStitch: content.disableStitch,
        });
        await markDistribution(
          distributionId,
          {
            status: 'publishing',
            upload_id: publishId,
            platform_metadata: { publish_id: publishId },
          },
          client
        );
        return {
          platform,
          channelId,
          distributionId,
          status: 'publishing',
          platformPostId: publishId,
        };
      }

      case 'instagram': {
        const { pageAccessToken, igUserId } = await getValidInstagramAccess(
          userId,
          channelId,
          client
        );
        const result = await publishInstagramReel({
          pageAccessToken,
          igUserId,
          videoUrl: sourceUrl,
          caption: formattedCaption,
          thumbnailUrl: content.thumbnailUrl,
        });
        await markDistribution(
          distributionId,
          {
            status: 'published',
            published_at: new Date().toISOString(),
            platform_post_id: result.mediaId,
            platform_url: result.permalink ?? null,
          },
          client
        );
        return {
          platform,
          channelId,
          distributionId,
          status: 'published',
          platformPostId: result.mediaId,
          platformUrl: result.permalink,
        };
      }

      case 'twitter': {
        const token = await getValidXAccessToken(userId, channelId, client);
        const mediaId = await uploadXVideo({
          accessToken: token,
          videoUrl: sourceUrl,
        });
        const tweet = await postXTweet({
          accessToken: token,
          text: formattedCaption,
          mediaIds: [mediaId],
        });
        await markDistribution(
          distributionId,
          {
            status: 'published',
            published_at: new Date().toISOString(),
            platform_post_id: tweet.tweetId,
            platform_url: tweet.url,
            platform_metadata: { media_id: mediaId },
          },
          client
        );
        return {
          platform,
          channelId,
          distributionId,
          status: 'published',
          platformPostId: tweet.tweetId,
          platformUrl: tweet.url,
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'publish_failed';
    await markDistribution(
      distributionId,
      { status: 'failed', last_error: msg },
      client
    );
    return {
      platform,
      channelId,
      distributionId,
      status: 'failed',
      error: msg,
    };
  }
}
