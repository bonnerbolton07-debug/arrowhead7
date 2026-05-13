// =============================================================================
// Arrowhead 7 — Strategy Brain UI: "Recommended for you" (dashboard home)
// =============================================================================
// Shown on /dashboard. Loads the top recommendations for Pro users; renders a
// soft teaser for everyone else so they understand the surface they're missing.

'use client';

import { useEffect, useState } from 'react';
import type {
  ContentRecommendation,
  RecommendationBundle,
} from '@/types/strategy';
import { RecommendationCard } from './RecommendationCard';
import { SparkleIcon, ArrowRightIcon } from '@/components/ui/icons';

interface RecommendedForYouProps {
  unlocked: boolean;
}

export function RecommendedForYou({ unlocked }: RecommendedForYouProps) {
  const [recs, setRecs] = useState<ContentRecommendation[]>([]);
  const [loading, setLoading] = useState(unlocked);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    const fetchRecs = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/strategy/recommendations?limit=3', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Failed to load recommendations');
        const data: RecommendationBundle = await res.json();
        if (!cancelled) setRecs(data.next_best);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRecs();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  if (!unlocked) {
    return (
      <section className="mb-12">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SparkleIcon size={18} gradient="dual" />
            <h2 className="text-lg font-semibold text-a7-text">Recommended for you</h2>
          </div>
          <a
            href="/dashboard/strategy"
            className="text-xs text-a7-text/40 hover:text-grad-teal transition-colors"
          >
            Strategy Brain &rarr;
          </a>
        </header>
        <div
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
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="max-w-xl">
              <h3 className="text-base font-semibold text-a7-text mb-1">
                Unlock Strategy Brain
              </h3>
              <p className="text-sm text-a7-text/60 leading-relaxed">
                Personalized content briefs, trend-aware posting times, and
                hook patterns picked for your niche — every time you log in.
              </p>
            </div>
            <a
              href="/dashboard/strategy"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-a7-void px-4 py-2 rounded-md transition-all"
              style={{
                background: 'linear-gradient(135deg, #2DD4BF, #B87333)',
                boxShadow:
                  '0 0 18px rgba(45,212,191,0.2), 0 0 18px rgba(184,115,51,0.2)',
              }}
            >
              See teaser
              <ArrowRightIcon size={14} gradient="copper" />
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SparkleIcon size={18} gradient="dual" />
          <h2 className="text-lg font-semibold text-a7-text">Recommended for you</h2>
        </div>
        <a
          href="/dashboard/strategy"
          className="text-xs text-a7-text/40 hover:text-grad-teal transition-colors"
        >
          See all in Strategy Brain &rarr;
        </a>
      </header>

      {loading ? (
        <div className="text-sm text-a7-text/40 p-6">Computing your next moves…</div>
      ) : error ? (
        <div className="text-sm" style={{ color: '#E8B06A' }}>
          {error}
        </div>
      ) : recs.length === 0 ? (
        <div className="text-sm text-a7-text/40 p-6">
          No recommendations yet — post a few times to seed the engine.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {recs.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} compact />
          ))}
        </div>
      )}
    </section>
  );
}
