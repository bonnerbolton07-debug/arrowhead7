// =============================================================================
// Arrowhead 7 — Multi-platform Distribute
// =============================================================================
// Fan-out publish to N channels in one call. Each target may carry its own
// per-platform content overrides; otherwise the top-level content is used.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  publishToChannel,
  type Platform,
  type PublishContent,
  type PublishOutcome,
} from '@/lib/distribute/publisher';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface MultiTarget {
  channelId: string;
  // Optional per-target overrides
  content?: Partial<PublishContent>;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const {
      editId,
      targets,
      content,
      scheduledFor,
    } = body as {
      editId: string;
      targets: MultiTarget[];
      content: PublishContent;
      scheduledFor?: string;
    };

    if (!editId || !Array.isArray(targets) || targets.length === 0 || !content?.title) {
      return NextResponse.json(
        { error: 'Missing editId, targets, or content.title' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const channelIds = targets.map((t) => t.channelId);
    const { data: channels } = await supabase
      .from('channels')
      .select('id, platform')
      .eq('user_id', user.id)
      .in('id', channelIds);

    const channelMap = new Map<string, Platform>();
    (channels ?? []).forEach((c) => {
      channelMap.set(c.id, c.platform as Platform);
    });

    const missing = channelIds.filter((id) => !channelMap.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Channels not found or not owned: ${missing.join(', ')}` },
        { status: 404 }
      );
    }

    // Scheduled path — insert rows with status='scheduled', no publish.
    if (scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 60_000) {
      const rows = targets.map((t) => {
        const platform = channelMap.get(t.channelId)!;
        const merged: PublishContent = { ...content, ...(t.content ?? {}) };
        return {
          edit_id: editId,
          channel_id: t.channelId,
          user_id: user.id,
          title: merged.title.slice(0, 120),
          description: merged.description ?? '',
          tags: merged.hashtags ?? [],
          thumbnail_url: merged.thumbnailUrl ?? null,
          platform,
          status: 'scheduled' as const,
          scheduled_for: scheduledFor,
          platform_metadata: {
            privacyStatus: merged.privacyStatus,
            categoryId: merged.categoryId,
            tiktokPrivacy: merged.tiktokPrivacy,
            disableComment: merged.disableComment,
            disableDuet: merged.disableDuet,
            disableStitch: merged.disableStitch,
          },
        };
      });
      const { data, error } = await supabase
        .from('distributions')
        .insert(rows)
        .select();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        status: 'scheduled',
        scheduledFor,
        distributions: data,
      });
    }

    // Immediate publish — run all platforms in parallel.
    const results = await Promise.all(
      targets.map((t) => {
        const platform = channelMap.get(t.channelId)!;
        const merged: PublishContent = { ...content, ...(t.content ?? {}) };
        return publishToChannel({
          userId: user.id,
          editId,
          channelId: t.channelId,
          platform,
          content: merged,
        });
      })
    );

    const succeeded = results.filter((r) => r.status !== 'failed').length;
    const failed = results.length - succeeded;
    return NextResponse.json({
      summary: { total: results.length, succeeded, failed },
      results: results as PublishOutcome[],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Multi distribute error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
