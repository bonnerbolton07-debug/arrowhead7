// =============================================================================
// Arrowhead 7 — Strategy Brain dashboard page
// =============================================================================
// Server component:
//   1. Loads the user + tier.
//   2. If unlocked, prefetches the recommendation bundle and renders the
//      interactive dashboard.
//   3. If locked, renders the upgrade teaser.

import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { LockedTeaser } from '@/components/strategy/LockedTeaser';
import { StrategyDashboard } from '@/components/strategy/StrategyDashboard';
import {
  buildRecommendations,
} from '@/lib/strategy-brain';
import { getUserTier } from '@/lib/strategy-brain/gating';
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import type { ContentPerformanceRow, RecommendationBundle } from '@/types/strategy';

export const dynamic = 'force-dynamic';

export default async function StrategyPage() {
  const access = await getUserTier();
  const supabaseReady = isSupabaseConfigured();

  let bundle: RecommendationBundle | null = null;
  if (access?.unlocked && supabaseReady) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: rows } = await supabase
        .from('content_performance')
        .select('*')
        .eq('user_id', access.user_id)
        .order('posted_at', { ascending: false })
        .limit(200);
      bundle = await buildRecommendations({
        userId: access.user_id,
        history: (rows ?? []) as ContentPerformanceRow[],
        limit: 6,
      });
    } catch (err) {
      console.error('Strategy prefetch failed:', err);
    }
  }

  return (
    <DashboardShell
      title="Strategy Brain"
      subtitle="Trend signals, hook ideas, and publishing recommendations for your content system."
    >
      <div className="max-w-6xl">
        {!supabaseReady && (
          <div
            className="mb-8 px-4 py-3 rounded-md text-sm"
            style={{
              background:
                'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
              border: '1px solid rgba(212,148,74,0.25)',
              color: '#E8B06A',
            }}
          >
            Supabase is not configured. Strategy Brain runs in demo mode —
            recommendations are generated from curated baselines until your
            channels and performance data are connected.
          </div>
        )}

        {access?.unlocked && bundle ? (
          <StrategyDashboard initialBundle={bundle} />
        ) : (
          <LockedTeaser tier={access?.tier} />
        )}
      </div>
    </DashboardShell>
  );
}
