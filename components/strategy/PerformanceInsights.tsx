// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Performance Insights
// =============================================================================

'use client';

import type { PerformanceInsight, PerformanceSummary } from '@/types/strategy';
import { GaugeIcon } from '@/components/ui/icons';
import { formatCount, formatPct } from './format';

interface PerformanceInsightsProps {
  summary: PerformanceSummary;
}

export function PerformanceInsights({ summary }: PerformanceInsightsProps) {
  if (summary.total_posts === 0) {
    return (
      <section
        className="rounded-lg p-8 text-center"
        style={{
          background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
          border: '1px solid rgba(245,240,232,0.04)',
        }}
      >
        <GaugeIcon size={36} className="mx-auto mb-3" />
        <h3 className="text-base font-semibold text-a7-text mb-1">No data yet</h3>
        <p className="text-sm text-a7-text/40 max-w-md mx-auto">
          Once you connect a channel or log your first published post,
          Strategy Brain will surface what&rsquo;s working and what isn&rsquo;t.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Posts analyzed" value={String(summary.total_posts)} />
        <Stat label="Avg engagement" value={formatPct(summary.average_engagement_rate)} />
        <Stat label="Avg completion" value={formatPct(summary.average_completion_rate, 0)} />
        <Stat label="Median views" value={formatCount(summary.median_views)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {summary.insights.map((insight, i) => (
          <InsightCard key={`${insight.kind}-${i}`} insight={insight} />
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-md p-3"
      style={{
        background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))',
        border: '1px solid rgba(45,212,191,0.08)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)',
        }}
      />
      <div className="text-[10px] uppercase tracking-wider text-a7-text/40 mb-1">
        {label}
      </div>
      <div className="text-xl font-semibold text-a7-text">{value}</div>
    </div>
  );
}

function InsightCard({ insight }: { insight: PerformanceInsight }) {
  const positive =
    insight.kind === 'top_topic' ||
    insight.kind === 'best_format' ||
    insight.kind === 'best_hook' ||
    insight.kind === 'best_day' ||
    insight.kind === 'best_hour' ||
    insight.kind === 'platform_strength';
  const fg = positive ? '#5BE8D5' : '#D4944A';
  const bg = positive
    ? 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))'
    : 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))';
  const border = positive ? 'rgba(45,212,191,0.1)' : 'rgba(184,115,51,0.1)';
  return (
    <div
      className="relative overflow-hidden rounded-md p-4"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <h4 className="text-sm font-semibold" style={{ color: fg }}>
          {insight.label}
        </h4>
        <span className="text-[10px] text-a7-text/30 uppercase tracking-wider">
          {insight.evidence_count} posts
        </span>
      </div>
      <p className="text-xs text-a7-text/60 leading-relaxed">{insight.detail}</p>
      <div
        className="mt-3 h-1 rounded-full overflow-hidden"
        style={{ background: 'rgba(245,240,232,0.05)' }}
      >
        <div
          className="h-1 rounded-full"
          style={{
            width: `${Math.round(insight.confidence * 100)}%`,
            background: `linear-gradient(90deg, ${fg}, ${positive ? '#2DD4BF' : '#B87333'})`,
          }}
        />
      </div>
    </div>
  );
}
