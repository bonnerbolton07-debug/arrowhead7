// =============================================================================
// Arrowhead 7 — Strategy Brain API: Analyze
// =============================================================================
// POST /api/strategy/analyze — analyze a creator's past content.
//
// Two modes:
//   1. {} or { source: 'history' } — analyze rows already in content_performance.
//   2. { posts: [...] } — analyze ad-hoc posts the caller passes in, AND
//      upsert them into content_performance so they feed future analysis.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  requireStrategyAccess,
  analyzePerformance,
} from '@/lib/strategy-brain';
import { StrategyAccessError } from '@/lib/strategy-brain/gating';
import type {
  ContentPerformanceRow,
  StrategyPlatform,
} from '@/types/strategy';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS: StrategyPlatform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
];

interface PostIn {
  platform?: string;
  post_url?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  watch_time_seconds?: number;
  completion_rate?: number;
  engagement_rate?: number;
  topic?: string;
  format?: string;
  hook_pattern?: string;
  duration_seconds?: number;
  posted_at?: string;
  edit_id?: string;
}

function sanitizePost(p: PostIn): {
  ok: boolean;
  row?: Omit<ContentPerformanceRow, 'id' | 'user_id' | 'created_at' | 'metrics_fetched_at'>;
  error?: string;
} {
  if (!p.platform || !VALID_PLATFORMS.includes(p.platform as StrategyPlatform)) {
    return { ok: false, error: 'Invalid or missing platform' };
  }
  if (!p.posted_at || Number.isNaN(new Date(p.posted_at).getTime())) {
    return { ok: false, error: 'Invalid or missing posted_at' };
  }
  return {
    ok: true,
    row: {
      platform: p.platform as StrategyPlatform,
      post_url: p.post_url,
      views: Number(p.views ?? 0),
      likes: Number(p.likes ?? 0),
      comments: Number(p.comments ?? 0),
      shares: Number(p.shares ?? 0),
      saves: Number(p.saves ?? 0),
      watch_time_seconds:
        typeof p.watch_time_seconds === 'number' ? p.watch_time_seconds : undefined,
      completion_rate:
        typeof p.completion_rate === 'number' ? p.completion_rate : undefined,
      engagement_rate:
        typeof p.engagement_rate === 'number' ? p.engagement_rate : undefined,
      topic: p.topic,
      format: p.format,
      hook_pattern: p.hook_pattern,
      duration_seconds:
        typeof p.duration_seconds === 'number' ? p.duration_seconds : undefined,
      posted_at: p.posted_at,
      edit_id: p.edit_id,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireStrategyAccess();
    const supabase = await createServerSupabaseClient();
    const body = (await request.json().catch(() => ({}))) as {
      posts?: PostIn[];
      source?: 'history' | 'inline';
    };

    if (Array.isArray(body.posts) && body.posts.length > 0) {
      // Validate + insert. We don't dedupe on post_url — multiple snapshots
      // over time are a feature.
      const sanitized = body.posts.map(sanitizePost);
      const invalid = sanitized.find((s) => !s.ok);
      if (invalid) {
        return NextResponse.json({ error: invalid.error }, { status: 400 });
      }
      const inserts = sanitized
        .map((s) => s.row!)
        .map((row) => ({ ...row, user_id: access.user_id }));
      const { error: insertError } = await supabase
        .from('content_performance')
        .insert(inserts);
      if (insertError) {
        console.error('content_performance insert failed:', insertError);
        return NextResponse.json(
          { error: 'Failed to save performance data' },
          { status: 500 }
        );
      }
    }

    const { data: rows } = await supabase
      .from('content_performance')
      .select('*')
      .eq('user_id', access.user_id)
      .order('posted_at', { ascending: false })
      .limit(500);

    const summary = analyzePerformance((rows ?? []) as ContentPerformanceRow[]);
    return NextResponse.json({ summary, analyzed_count: rows?.length ?? 0 });
  } catch (err) {
    if (err instanceof StrategyAccessError) {
      return NextResponse.json(
        { error: err.message, code: err.code, locked: err.code === 'locked' },
        { status: err.status }
      );
    }
    console.error('Strategy analyze failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
