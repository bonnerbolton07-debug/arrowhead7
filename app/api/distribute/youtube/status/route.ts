// =============================================================================
// Arrowhead 7 — YouTube: Upload Status
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getValidYouTubeAccessToken,
  getYouTubeVideoStatus,
} from '@/lib/distribute/youtube';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const distributionId = request.nextUrl.searchParams.get('distributionId');
    if (!distributionId) {
      return NextResponse.json({ error: 'Missing distributionId' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: dist } = await supabase
      .from('distributions')
      .select('*')
      .eq('id', distributionId)
      .eq('user_id', user.id)
      .single();
    if (!dist) {
      return NextResponse.json({ error: 'Distribution not found' }, { status: 404 });
    }
    if (dist.platform !== 'youtube' || !dist.platform_post_id) {
      return NextResponse.json({ error: 'Not a YouTube distribution' }, { status: 400 });
    }

    const accessToken = await getValidYouTubeAccessToken(user.id, dist.channel_id);
    const status = await getYouTubeVideoStatus({
      accessToken,
      videoId: dist.platform_post_id,
    });

    await supabase
      .from('distributions')
      .update({
        platform_metadata: {
          ...(typeof dist.platform_metadata === 'object' && dist.platform_metadata
            ? dist.platform_metadata
            : {}),
          uploadStatus: status.uploadStatus,
          processingStatus: status.processingStatus,
        },
      })
      .eq('id', distributionId);

    return NextResponse.json(status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('YouTube status error:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
