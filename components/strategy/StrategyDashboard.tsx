// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Main dashboard client
// =============================================================================
// Tabs: Overview · Calendar · Trends · Performance · Hooks
// Fetches data via the /api/strategy/* endpoints.

'use client';

import { useEffect, useState } from 'react';
import type {
  ContentCalendarEntry,
  ContentRecommendation,
  PerformanceSummary,
  RecommendationBundle,
  Trend,
} from '@/types/strategy';
import { HealthMeter } from './HealthMeter';
import { RecommendationCard } from './RecommendationCard';
import { CalendarView } from './CalendarView';
import { TrendsPanel } from './TrendsPanel';
import { PerformanceInsights } from './PerformanceInsights';
import { HookLibrary } from './HookLibrary';
import {
  CompassIcon,
  CalendarIcon,
  TrendIcon,
  TargetIcon,
  HookIcon,
  SparkleIcon,
} from '@/components/ui/icons';

type Tab = 'overview' | 'calendar' | 'trends' | 'performance' | 'hooks';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <SparkleIcon size={16} gradient="dual" /> },
  { id: 'calendar', label: 'Calendar', icon: <CalendarIcon size={16} gradient="teal" /> },
  { id: 'trends', label: 'Trends', icon: <TrendIcon size={16} gradient="copper" /> },
  { id: 'performance', label: 'Performance', icon: <TargetIcon size={16} gradient="teal" /> },
  { id: 'hooks', label: 'Hooks', icon: <HookIcon size={16} gradient="copper" /> },
];

interface StrategyDashboardProps {
  initialBundle: RecommendationBundle;
}

export function StrategyDashboard({ initialBundle }: StrategyDashboardProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [bundle, setBundle] = useState<RecommendationBundle>(initialBundle);
  const [calendarData, setCalendarData] = useState<{
    saved: ContentCalendarEntry[];
    suggestions: ContentCalendarEntry[];
  }>({ saved: [], suggestions: [] });
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);

  // Lazy-load each tab's data when first opened.
  useEffect(() => {
    if (tab !== 'calendar') return;
    let cancelled = false;
    fetch('/api/strategy/calendar?days=14', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        setCalendarData({
          saved: data.saved ?? [],
          suggestions: data.suggestions ?? [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== 'performance') return;
    let cancelled = false;
    fetch('/api/strategy/analyze', { method: 'POST', body: '{}' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        setSummary(data.summary as PerformanceSummary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const refresh = async () => {
    const res = await fetch('/api/strategy/recommendations?limit=6', {
      cache: 'no-store',
    });
    if (res.ok) {
      const data: RecommendationBundle = await res.json();
      setBundle(data);
    }
  };

  const confirmSlot = async (entry: ContentCalendarEntry) => {
    if (entry.status !== 'suggested') return;
    try {
      const res = await fetch('/api/strategy/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: entry.scheduled_date,
          platform: entry.platform,
          content_type: entry.content_type,
          strategy_brief: entry.strategy_brief,
          status: 'confirmed',
          ai_confidence: entry.ai_confidence,
        }),
      });
      if (res.ok) {
        const saved = (await res.json()) as ContentCalendarEntry;
        setCalendarData((prev) => ({
          saved: [...prev.saved, saved],
          suggestions: prev.suggestions.filter((s) => s.id !== entry.id),
        }));
      }
    } catch {
      // Silently ignore — the chip stays as suggested
    }
  };

  return (
    <div>
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <CompassIcon size={28} gradient="dual" />
          <h1 className="text-2xl font-bold text-a7-text">Strategy Brain</h1>
        </div>
        <p className="text-a7-text/40 text-sm max-w-2xl">
          Your algorithm-aware copilot. What to make, when to post, and why —
          tuned to your performance and live platform trends.
        </p>
      </header>

      <nav
        className="flex items-center gap-1 mb-6 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                active ? 'text-a7-text' : 'text-a7-text/40 hover:text-a7-text'
              }`}
              style={
                active
                  ? {
                      background:
                        'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                      border: '1px solid rgba(45,212,191,0.15)',
                      boxShadow: '0 0 12px rgba(45,212,191,0.08)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === 'overview' && (
        <OverviewTab bundle={bundle} onRefresh={refresh} />
      )}
      {tab === 'calendar' && (
        <CalendarView
          saved={calendarData.saved}
          suggestions={calendarData.suggestions}
          onConfirm={confirmSlot}
        />
      )}
      {tab === 'trends' && <TrendsPanel />}
      {tab === 'performance' && (
        <PerformanceInsights
          summary={
            summary ?? {
              total_posts: 0,
              average_engagement_rate: 0,
              average_completion_rate: 0,
              median_views: 0,
              insights: [],
              health_score: bundle.health_score,
            }
          }
        />
      )}
      {tab === 'hooks' && <HookLibrary />}
    </div>
  );
}

function OverviewTab({
  bundle,
  onRefresh,
}: {
  bundle: RecommendationBundle;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const highPriority = bundle.next_best.filter(
    (r: ContentRecommendation) => r.priority === 'high'
  );
  const rest = bundle.next_best.filter(
    (r: ContentRecommendation) => r.priority !== 'high'
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-8">
      <section
        className="relative overflow-hidden rounded-lg p-6"
        style={{
          background:
            'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(184,115,51,0.02))',
          border: '1px solid rgba(45,212,191,0.1)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, rgba(45,212,191,0.3), rgba(184,115,51,0.2), transparent)',
          }}
        />
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <HealthMeter
            score={bundle.health_score}
            sublabel={`${bundle.next_best.length} recs ready`}
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs font-medium text-a7-text/80 px-3 py-2 rounded-md transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
              border: '1px solid rgba(45,212,191,0.15)',
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh briefs'}
          </button>
        </div>
      </section>

      {highPriority.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-a7-text">
              Next Best Content
            </h2>
            <span className="text-xs text-a7-text/30">
              Generated {new Date(bundle.generated_at).toLocaleTimeString()}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {highPriority.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-a7-text mb-3">
            More ideas in the queue
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {rest.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} compact />
            ))}
          </div>
        </section>
      )}

      {bundle.next_best.length === 0 && (
        <section
          className="rounded-lg p-8 text-center"
          style={{
            background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
            border: '1px solid rgba(245,240,232,0.04)',
          }}
        >
          <p className="text-sm text-a7-text/40">
            Strategy Brain is warming up. Once you connect a channel or log
            past posts, you&rsquo;ll see ranked content briefs here.
          </p>
        </section>
      )}
    </div>
  );
}
