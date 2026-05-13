// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Trends Panel
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import type {
  StrategyPlatform,
  Trend,
  TrendAudio,
  TrendFormat,
  TrendHashtag,
  TrendType,
} from '@/types/strategy';
import { platformAccent, platformLabel } from './format';
import { TrendIcon } from '@/components/ui/icons';

interface TrendsPanelProps {
  initialTrends?: Trend[];
  initialPlatform?: StrategyPlatform;
}

const PLATFORMS: StrategyPlatform[] = ['tiktok', 'instagram', 'youtube', 'twitter', 'linkedin'];
const TYPES: { id: TrendType; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'hashtag', label: 'Hashtags' },
  { id: 'format', label: 'Formats' },
];

export function TrendsPanel({
  initialTrends = [],
  initialPlatform = 'tiktok',
}: TrendsPanelProps) {
  const [platform, setPlatform] = useState<StrategyPlatform>(initialPlatform);
  const [type, setType] = useState<TrendType>('audio');
  const [trends, setTrends] = useState<Trend[]>(initialTrends);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchTrends = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/strategy/trends?platform=${platform}&type=${type}&limit=20`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error('Failed');
        const data: { trends: Trend[] } = await res.json();
        if (!cancelled) setTrends(data.trends);
      } catch {
        if (!cancelled) setTrends([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTrends();
    return () => {
      cancelled = true;
    };
  }, [platform, type]);

  const accent = platformAccent(platform);

  return (
    <section>
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendIcon size={20} gradient="copper" />
          <h3 className="text-lg font-semibold text-a7-text">What&rsquo;s Trending</h3>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="inline-flex rounded-md p-1 gap-1"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.04)',
            }}
          >
            {PLATFORMS.map((p) => {
              const active = p === platform;
              return (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-2.5 py-1 text-xs rounded transition-all ${
                    active ? 'text-a7-void font-medium' : 'text-a7-text/50 hover:text-a7-text'
                  }`}
                  style={
                    active
                      ? {
                          background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                          boxShadow: '0 0 10px rgba(45,212,191,0.18)',
                        }
                      : {}
                  }
                >
                  {platformLabel(p)}
                </button>
              );
            })}
          </div>
          <div
            className="inline-flex rounded-md p-1 gap-1"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.04)',
            }}
          >
            {TYPES.map((t) => {
              const active = t.id === type;
              return (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  className={`px-2.5 py-1 text-xs rounded transition-all ${
                    active ? 'text-a7-void font-medium' : 'text-a7-text/50 hover:text-a7-text'
                  }`}
                  style={
                    active
                      ? {
                          background: 'linear-gradient(135deg, #8B5A2B, #B87333)',
                          boxShadow: '0 0 10px rgba(184,115,51,0.2)',
                        }
                      : {}
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
          border: `1px solid ${accent.border}`,
        }}
      >
        <div
          className="absolute h-px"
          style={{
            background: `linear-gradient(90deg, ${accent.fg}, transparent)`,
            opacity: 0.2,
          }}
        />
        {loading && trends.length === 0 ? (
          <div className="p-8 text-center text-a7-text/40 text-sm">Loading trends…</div>
        ) : trends.length === 0 ? (
          <div className="p-8 text-center text-a7-text/40 text-sm">
            No trends in cache yet — once ingest runs we&rsquo;ll surface them here.
          </div>
        ) : (
          <ul className="divide-y divide-a7-text/[0.04]">
            {trends.map((t) => (
              <TrendRow key={t.id} trend={t} type={type} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TrendRow({ trend, type }: { trend: Trend; type: TrendType }) {
  if (type === 'audio') return <AudioRow data={trend.trend_data as TrendAudio} score={trend.score} />;
  if (type === 'hashtag') return <HashtagRow data={trend.trend_data as TrendHashtag} score={trend.score} />;
  if (type === 'format') return <FormatRow data={trend.trend_data as TrendFormat} score={trend.score} />;
  return null;
}

function ScoreBadge({ score }: { score: number | undefined }) {
  if (score == null) return null;
  return (
    <span
      className="text-[10px] uppercase tracking-wider text-a7-text/50 px-2 py-1 rounded"
      style={{
        background: 'rgba(45,212,191,0.05)',
        border: '1px solid rgba(45,212,191,0.12)',
      }}
    >
      {Math.round(score)}
    </span>
  );
}

function AudioRow({ data, score }: { data: TrendAudio; score?: number }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-a7-text/[0.02] transition-colors">
      <div className="min-w-0">
        <div className="text-sm text-a7-text truncate">{data.title}</div>
        <div className="text-xs text-a7-text/40 truncate">
          {data.artist ? data.artist : 'Original sound'}
          {typeof data.uses_count === 'number' && (
            <span> &middot; {data.uses_count.toLocaleString()} uses</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {typeof data.growth_pct === 'number' && (
          <span className="text-xs text-grad-teal">+{data.growth_pct}%</span>
        )}
        <ScoreBadge score={score} />
      </div>
    </li>
  );
}

function HashtagRow({ data, score }: { data: TrendHashtag; score?: number }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-a7-text/[0.02] transition-colors">
      <div>
        <span className="text-sm font-medium text-grad-teal">{data.tag}</span>
        {typeof data.post_count === 'number' && data.post_count > 0 && (
          <span className="text-xs text-a7-text/40 ml-2">
            {data.post_count.toLocaleString()} posts
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {typeof data.growth_pct === 'number' && (
          <span className="text-xs text-grad-copper">+{data.growth_pct}%</span>
        )}
        <ScoreBadge score={score} />
      </div>
    </li>
  );
}

function FormatRow({ data, score }: { data: TrendFormat; score?: number }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-a7-text/[0.02] transition-colors">
      <div className="min-w-0">
        <div className="text-sm text-a7-text">{data.name}</div>
        <div className="text-xs text-a7-text/40 leading-relaxed">{data.description}</div>
      </div>
      <ScoreBadge score={score} />
    </li>
  );
}

