// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Shared formatters
// =============================================================================

import type { StrategyPlatform } from '@/types/strategy';

const PLATFORM_LABELS: Record<StrategyPlatform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

export function platformLabel(p: StrategyPlatform): string {
  return PLATFORM_LABELS[p];
}

export function formatScheduledDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round(
    (d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const PLATFORM_ACCENTS: Record<
  StrategyPlatform,
  { fg: string; bg: string; border: string }
> = {
  tiktok: {
    fg: '#5BE8D5',
    bg: 'rgba(45,212,191,0.08)',
    border: 'rgba(45,212,191,0.18)',
  },
  instagram: {
    fg: '#D4944A',
    bg: 'rgba(184,115,51,0.08)',
    border: 'rgba(184,115,51,0.18)',
  },
  youtube: {
    fg: '#E8B06A',
    bg: 'rgba(184,115,51,0.10)',
    border: 'rgba(184,115,51,0.22)',
  },
  twitter: {
    fg: '#8FF0E5',
    bg: 'rgba(45,212,191,0.06)',
    border: 'rgba(45,212,191,0.14)',
  },
  linkedin: {
    fg: '#1A8E84',
    bg: 'rgba(45,212,191,0.05)',
    border: 'rgba(45,212,191,0.12)',
  },
  facebook: {
    fg: '#8B5A2B',
    bg: 'rgba(184,115,51,0.05)',
    border: 'rgba(184,115,51,0.12)',
  },
};

export function platformAccent(p: StrategyPlatform) {
  return PLATFORM_ACCENTS[p];
}

export function formatCount(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

export function formatPct(n: number | undefined | null, digits = 1): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}
