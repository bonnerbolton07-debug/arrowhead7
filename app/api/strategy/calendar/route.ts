// =============================================================================
// Arrowhead 7 — Strategy Brain API: Calendar
// =============================================================================
// GET  /api/strategy/calendar — saved + AI-suggested slots for a window.
// POST /api/strategy/calendar — create / upsert a calendar slot.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  requireStrategyAccess,
  generateCalendarSuggestions,
} from '@/lib/strategy-brain';
import { StrategyAccessError } from '@/lib/strategy-brain/gating';
import type {
  CalendarStatus,
  ContentCalendarEntry,
  ContentPerformanceRow,
  ContentType,
  StrategyBrief,
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

const VALID_CONTENT_TYPES: ContentType[] = [
  'educational',
  'entertaining',
  'trending',
  'series',
  'promotional',
  'community',
];

const VALID_STATUS: CalendarStatus[] = [
  'suggested',
  'confirmed',
  'in_progress',
  'published',
  'skipped',
];

export async function GET(request: NextRequest) {
  try {
    const access = await requireStrategyAccess();
    const supabase = await createServerSupabaseClient();
    const url = new URL(request.url);

    const startStr = url.searchParams.get('start');
    const daysStr = url.searchParams.get('days');
    const start = startStr ? new Date(startStr) : new Date();
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start' }, { status: 400 });
    }
    const days = Math.min(60, Math.max(1, Number(daysStr ?? 14)));
    const windowEnd = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    // Saved entries inside the window
    const { data: saved } = await supabase
      .from('content_calendar')
      .select('*')
      .eq('user_id', access.user_id)
      .gte('scheduled_date', start.toISOString())
      .lt('scheduled_date', windowEnd.toISOString())
      .order('scheduled_date', { ascending: true });

    // Pull history to inform suggestion timing
    const { data: history } = await supabase
      .from('content_performance')
      .select('*')
      .eq('user_id', access.user_id)
      .order('posted_at', { ascending: false })
      .limit(200);

    const suggestions = generateCalendarSuggestions(access.user_id, {
      startDate: start,
      days,
      history: (history ?? []) as ContentPerformanceRow[],
    });

    // Suggestions filtered to slots the user hasn't already saved at the same hour+platform
    const savedKeys = new Set(
      (saved ?? []).map(
        (e) =>
          `${e.platform}|${new Date(e.scheduled_date).toISOString().slice(0, 13)}`
      )
    );
    const filteredSuggestions = suggestions.filter(
      (s) =>
        !savedKeys.has(
          `${s.platform}|${new Date(s.scheduled_date).toISOString().slice(0, 13)}`
        )
    );

    return NextResponse.json({
      window: { start: start.toISOString(), days },
      saved: (saved ?? []) as ContentCalendarEntry[],
      suggestions: filteredSuggestions,
    });
  } catch (err) {
    if (err instanceof StrategyAccessError) {
      return NextResponse.json(
        { error: err.message, code: err.code, locked: err.code === 'locked' },
        { status: err.status }
      );
    }
    console.error('Strategy calendar GET failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

interface CalendarUpsertBody {
  id?: string;
  scheduled_date?: string;
  platform?: StrategyPlatform;
  content_type?: ContentType;
  strategy_brief?: StrategyBrief;
  status?: CalendarStatus;
  style_dna_id?: string | null;
  ai_confidence?: number;
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireStrategyAccess();
    const supabase = await createServerSupabaseClient();
    const body = (await request.json()) as CalendarUpsertBody;

    if (!body.scheduled_date || !body.platform || !body.content_type) {
      return NextResponse.json(
        { error: 'Missing scheduled_date / platform / content_type' },
        { status: 400 }
      );
    }
    if (!VALID_PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (!VALID_CONTENT_TYPES.includes(body.content_type)) {
      return NextResponse.json({ error: 'Invalid content_type' }, { status: 400 });
    }
    const status = body.status ?? 'confirmed';
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (Number.isNaN(new Date(body.scheduled_date).getTime())) {
      return NextResponse.json({ error: 'Invalid scheduled_date' }, { status: 400 });
    }

    const row = {
      user_id: access.user_id,
      scheduled_date: body.scheduled_date,
      platform: body.platform,
      content_type: body.content_type,
      strategy_brief: body.strategy_brief ?? {},
      status,
      style_dna_id: body.style_dna_id ?? null,
      ai_confidence:
        typeof body.ai_confidence === 'number' ? body.ai_confidence : null,
    };

    let result;
    if (body.id) {
      result = await supabase
        .from('content_calendar')
        .update(row)
        .eq('id', body.id)
        .eq('user_id', access.user_id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('content_calendar')
        .insert(row)
        .select()
        .single();
    }

    if (result.error || !result.data) {
      console.error('Calendar upsert failed:', result.error);
      return NextResponse.json(
        { error: 'Failed to save calendar entry' },
        { status: 500 }
      );
    }

    return NextResponse.json(result.data);
  } catch (err) {
    if (err instanceof StrategyAccessError) {
      return NextResponse.json(
        { error: err.message, code: err.code, locked: err.code === 'locked' },
        { status: err.status }
      );
    }
    console.error('Strategy calendar POST failed:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
