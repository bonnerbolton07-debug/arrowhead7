// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Post-render plan
// =============================================================================
// After a render completes, suggest the optimal posting time + platform.
// Pulls from /api/strategy/recommendations and falls back gracefully if the
// user is locked or the call fails.

'use client';

import { useEffect, useState } from 'react';
import type {
  ContentRecommendation,
  RecommendationBundle,
  StrategyPlatform,
} from '@/types/strategy';
import {
  formatScheduledDate,
  platformAccent,
  platformLabel,
} from './format';
import { CompassIcon, ArrowRightIcon } from '@/components/ui/icons';

interface PostRenderPlanProps {
  preferredPlatform?: StrategyPlatform;
}

export function PostRenderPlan({ preferredPlatform }: PostRenderPlanProps) {
  const [rec, setRec] = useState<ContentRecommendation | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchPlan = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '6' });
        if (preferredPlatform) params.set('platforms', preferredPlatform);
        const res = await fetch(
          `/api/strategy/recommendations?${params.toString()}`,
          { cache: 'no-store' }
        );
        if (res.status === 402) {
          if (!cancelled) setLocked(true);
          return;
        }
        if (!res.ok) throw new Error('Failed');
        const data: RecommendationBundle = await res.json();
        if (!cancelled) {
          const filtered = preferredPlatform
            ? data.next_best.find((r) => r.platform === preferredPlatform) ??
              data.next_best[0]
            : data.next_best[0];
          setRec(filtered ?? null);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPlan();
    return () => {
      cancelled = true;
    };
  }, [preferredPlatform]);

  if (loading) return null;

  if (locked) {
    return (
      <aside
        className="mt-6 rounded-lg p-4 text-left"
        style={{
          background:
            'linear-gradient(135deg, rgba(184,115,51,0.05), rgba(184,115,51,0.01))',
          border: '1px solid rgba(184,115,51,0.18)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <CompassIcon size={16} gradient="copper" />
          <h4 className="text-sm font-semibold text-a7-text">
            Strategy Brain has a posting plan
          </h4>
        </div>
        <p className="text-xs text-a7-text/60 mb-3">
          Unlock to get a recommended platform and time for this edit.
        </p>
        <a
          href="/pricing"
          className="inline-flex items-center gap-1 text-xs font-medium text-a7-void px-3 py-1.5 rounded-md"
          style={{
            background: 'linear-gradient(135deg, #8B5A2B, #D4944A)',
          }}
        >
          Upgrade
          <ArrowRightIcon size={12} gradient="teal" />
        </a>
      </aside>
    );
  }

  if (!rec) return null;

  const accent = platformAccent(rec.platform);

  return (
    <aside
      className="mt-6 rounded-lg p-4 text-left"
      style={{
        background:
          'linear-gradient(135deg, rgba(45,212,191,0.05), rgba(45,212,191,0.01))',
        border: '1px solid rgba(45,212,191,0.18)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <CompassIcon size={16} gradient="dual" />
        <h4 className="text-sm font-semibold text-a7-text">
          Strategy Brain — Posting plan
        </h4>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-xs font-medium px-2 py-1 rounded"
          style={{
            color: accent.fg,
            background: accent.bg,
            border: `1px solid ${accent.border}`,
          }}
        >
          {platformLabel(rec.platform)}
        </span>
        <span className="text-xs text-a7-text/60">
          {formatScheduledDate(rec.scheduled_for)}
        </span>
        {typeof rec.estimated_lift_pct === 'number' && (
          <span className="text-xs text-grad-teal">+{rec.estimated_lift_pct}% est. lift</span>
        )}
      </div>
      {rec.brief.reasoning && (
        <p className="text-xs text-a7-text/50 leading-relaxed">
          {rec.brief.reasoning}
        </p>
      )}
    </aside>
  );
}
