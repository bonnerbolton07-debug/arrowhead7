// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Recommendation Card
// =============================================================================
// "Next Best Content" card with one-click Create This action.

'use client';

import type { ContentRecommendation } from '@/types/strategy';
import {
  formatScheduledDate,
  platformAccent,
  platformLabel,
} from './format';
import { ArrowRightIcon } from '@/components/ui/icons';

interface RecommendationCardProps {
  rec: ContentRecommendation;
  compact?: boolean;
}

export function RecommendationCard({ rec, compact = false }: RecommendationCardProps) {
  const accent = platformAccent(rec.platform);
  const editorHref = buildEditorHref(rec);

  return (
    <article
      className="relative overflow-hidden rounded-lg p-5 flex flex-col gap-3 transition-all hover:scale-[1.005]"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, rgba(45,212,191,0.2), rgba(184,115,51,0.15), transparent)',
        }}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
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
          <span className="text-xs text-a7-text/30 uppercase tracking-wide">
            {rec.content_type}
          </span>
        </div>
        <PriorityBadge priority={rec.priority} />
      </header>

      <h3 className="text-base font-semibold text-a7-text leading-tight">
        {rec.brief.title}
      </h3>

      {!compact && rec.brief.hook && (
        <div
          className="text-sm text-a7-text/60 italic px-3 py-2 rounded"
          style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))',
            border: '1px solid rgba(45,212,191,0.08)',
          }}
        >
          &ldquo;{rec.brief.hook}&rdquo;
        </div>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {rec.reasoning_chips.map((chip) => (
          <li
            key={chip}
            className="text-[10px] uppercase tracking-wider text-a7-text/50 px-2 py-1 rounded"
            style={{
              background: 'rgba(245,240,232,0.03)',
              border: '1px solid rgba(245,240,232,0.05)',
            }}
          >
            {chip}
          </li>
        ))}
      </ul>

      {!compact && rec.brief.reasoning && (
        <p className="text-xs text-a7-text/40 leading-relaxed">
          {rec.brief.reasoning}
        </p>
      )}

      <footer className="flex items-center justify-between gap-3 mt-1">
        <div className="text-xs text-a7-text/40">
          Post {formatScheduledDate(rec.scheduled_for)}
          {typeof rec.estimated_lift_pct === 'number' && (
            <span className="text-grad-teal ml-2">+{rec.estimated_lift_pct}% est.</span>
          )}
        </div>
        <a
          href={editorHref}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-a7-void px-3 py-2 rounded-md transition-all"
          style={{
            background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
            boxShadow: '0 0 14px rgba(45,212,191,0.25)',
          }}
        >
          Create This
          <ArrowRightIcon size={14} gradient="copper" />
        </a>
      </footer>
    </article>
  );
}

function PriorityBadge({ priority }: { priority: ContentRecommendation['priority'] }) {
  if (priority === 'high') {
    return (
      <span
        className="text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold"
        style={{
          color: '#0C0C0A',
          background: 'linear-gradient(135deg, #2DD4BF, #B87333)',
          boxShadow: '0 0 10px rgba(45,212,191,0.3)',
        }}
      >
        Priority
      </span>
    );
  }
  if (priority === 'medium') {
    return (
      <span
        className="text-[10px] uppercase tracking-wider px-2 py-1 rounded text-a7-text/60"
        style={{ border: '1px solid rgba(245,240,232,0.1)' }}
      >
        Mid
      </span>
    );
  }
  return null;
}

function buildEditorHref(rec: ContentRecommendation): string {
  const params = new URLSearchParams();
  params.set('source', 'strategy');
  params.set('platform', rec.platform);
  params.set('contentType', rec.content_type);
  params.set('title', rec.brief.title);
  if (rec.brief.hook_pattern_id) params.set('hookId', rec.brief.hook_pattern_id);
  if (rec.brief.hook) params.set('hook', rec.brief.hook);
  if (rec.brief.duration_seconds)
    params.set('duration', String(rec.brief.duration_seconds));
  if (rec.brief.format) params.set('format', rec.brief.format);
  params.set('scheduledFor', rec.scheduled_for);
  return `/editor?${params.toString()}`;
}
