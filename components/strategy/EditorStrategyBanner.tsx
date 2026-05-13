// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Editor banner
// =============================================================================
// Inline panel shown at the top of /editor when the user arrives from a
// Strategy Brain recommendation. Surfaces title/hook/platform/scheduled time
// so they can see the brief they're acting on without leaving the flow.

'use client';

import { useEffect, useState } from 'react';
import type { StrategyPlatform } from '@/types/strategy';
import { SparkleIcon, CompassIcon } from '@/components/ui/icons';
import {
  formatScheduledDate,
  platformAccent,
  platformLabel,
} from './format';

export interface EditorStrategyBrief {
  source: string;
  platform?: StrategyPlatform;
  contentType?: string;
  title?: string;
  hook?: string;
  hookId?: string;
  duration?: string;
  format?: string;
  scheduledFor?: string;
}

export function parseStrategyParams(
  search: URLSearchParams
): EditorStrategyBrief | null {
  const source = search.get('source');
  if (source !== 'strategy') return null;
  return {
    source,
    platform: (search.get('platform') ?? undefined) as
      | StrategyPlatform
      | undefined,
    contentType: search.get('contentType') ?? undefined,
    title: search.get('title') ?? undefined,
    hook: search.get('hook') ?? undefined,
    hookId: search.get('hookId') ?? undefined,
    duration: search.get('duration') ?? undefined,
    format: search.get('format') ?? undefined,
    scheduledFor: search.get('scheduledFor') ?? undefined,
  };
}

interface EditorStrategyBannerProps {
  brief: EditorStrategyBrief;
}

export function EditorStrategyBanner({ brief }: EditorStrategyBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const accent = brief.platform ? platformAccent(brief.platform) : null;

  return (
    <div
      className="relative overflow-hidden rounded-lg p-4 mb-6 mx-auto max-w-2xl"
      style={{
        background:
          'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(184,115,51,0.03))',
        border: '1px solid rgba(45,212,191,0.18)',
        boxShadow: '0 0 20px rgba(45,212,191,0.08)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, rgba(45,212,191,0.35), rgba(184,115,51,0.25), transparent)',
        }}
      />
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CompassIcon size={18} gradient="dual" />
          <span className="text-xs uppercase tracking-wider text-grad-teal">
            Strategy Brain Brief
          </span>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs text-a7-text/40 hover:text-a7-text transition-colors"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </header>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {brief.title && (
            <h3 className="text-base font-semibold text-a7-text leading-tight">
              {brief.title}
            </h3>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            {brief.platform && accent && (
              <span
                className="px-2 py-1 rounded font-medium"
                style={{
                  color: accent.fg,
                  background: accent.bg,
                  border: `1px solid ${accent.border}`,
                }}
              >
                {platformLabel(brief.platform)}
              </span>
            )}
            {brief.contentType && (
              <span className="px-2 py-1 rounded text-a7-text/60 capitalize"
                style={{ border: '1px solid rgba(245,240,232,0.08)' }}
              >
                {brief.contentType}
              </span>
            )}
            {brief.format && (
              <span className="px-2 py-1 rounded text-a7-text/60 capitalize"
                style={{ border: '1px solid rgba(245,240,232,0.08)' }}
              >
                {brief.format}
              </span>
            )}
            {brief.duration && (
              <span className="px-2 py-1 rounded text-a7-text/60"
                style={{ border: '1px solid rgba(245,240,232,0.08)' }}
              >
                {brief.duration}s
              </span>
            )}
          </div>

          {brief.hook && (
            <div
              className="text-sm text-a7-text/80 italic px-3 py-2 rounded"
              style={{
                background:
                  'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))',
                border: '1px solid rgba(45,212,191,0.1)',
              }}
            >
              <div className="text-[10px] uppercase tracking-wider text-a7-text/40 mb-1 not-italic">
                Hook
              </div>
              &ldquo;{brief.hook}&rdquo;
            </div>
          )}

          {brief.scheduledFor && (
            <div className="flex items-center gap-1 text-xs text-a7-text/50">
              <SparkleIcon size={12} gradient="dual" />
              <span>Optimal post window: {formatScheduledDate(brief.scheduledFor)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Convenience hook for client components — pulls brief from window.location. */
export function useStrategyBrief(): EditorStrategyBrief | null {
  const [brief, setBrief] = useState<EditorStrategyBrief | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setBrief(parseStrategyParams(params));
  }, []);
  return brief;
}
