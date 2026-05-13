// =============================================================================
// Arrowhead 7 — Scheduled-publish Cron
// =============================================================================
// Polls `distributions` for rows where status='scheduled' and scheduled_for
// is in the past, then publishes each via the unified publisher.
//
// Schedule on Vercel via vercel.json (5-minute cadence is a good default).
// Protected by CRON_SECRET — Vercel sends it as a Bearer token.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabase/admin';
import {
  publishToChannel,
  type Platform,
  type PublishContent,
} from '@/lib/distribute/publisher';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BATCH = 25;
const MAX_ATTEMPTS = 3;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

interface ScheduledDistribution {
  id: string;
  edit_id: string;
  channel_id: string;
  user_id: string;
  platform: Platform;
  title: string;
  description: string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  platform_metadata: Record<string, unknown> | null;
  publish_attempts: number | null;
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'admin_not_configured' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('distributions')
    .select(
      'id, edit_id, channel_id, user_id, platform, title, description, tags, thumbnail_url, platform_metadata, publish_attempts'
    )
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .lt('publish_attempts', MAX_ATTEMPTS)
    .order('scheduled_for', { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as ScheduledDistribution[];

  const results = await Promise.all(
    due.map(async (dist) => {
      // Bump attempt counter + mark publishing.
      await supabase
        .from('distributions')
        .update({
          status: 'publishing',
          publish_attempts: (dist.publish_attempts ?? 0) + 1,
        })
        .eq('id', dist.id);

      const meta = (dist.platform_metadata ?? {}) as Record<string, unknown>;
      const content: PublishContent = {
        title: dist.title,
        description: dist.description ?? undefined,
        hashtags: dist.tags ?? [],
        thumbnailUrl: dist.thumbnail_url ?? undefined,
        privacyStatus: meta.privacyStatus as PublishContent['privacyStatus'],
        categoryId: meta.categoryId as string | undefined,
        tiktokPrivacy: meta.tiktokPrivacy as PublishContent['tiktokPrivacy'],
        disableComment: meta.disableComment as boolean | undefined,
        disableDuet: meta.disableDuet as boolean | undefined,
        disableStitch: meta.disableStitch as boolean | undefined,
      };

      return publishToChannel({
        userId: dist.user_id,
        editId: dist.edit_id,
        channelId: dist.channel_id,
        platform: dist.platform,
        content,
        existingDistributionId: dist.id,
        client: supabase,
      });
    })
  );

  const succeeded = results.filter((r) => r.status !== 'failed').length;
  return NextResponse.json({
    processed: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
}
