// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Content Calendar
// =============================================================================
// Week / month view with AI-suggested + user-confirmed slots.

'use client';

import { useMemo, useState } from 'react';
import type {
  ContentCalendarEntry,
  StrategyPlatform,
} from '@/types/strategy';
import {
  formatTime,
  platformAccent,
  platformLabel,
} from './format';

interface CalendarViewProps {
  saved: ContentCalendarEntry[];
  suggestions: ContentCalendarEntry[];
  onConfirm?: (entry: ContentCalendarEntry) => void;
}

type Mode = 'week' | 'month';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfWeek(d: Date): Date {
  const sd = startOfDay(d);
  sd.setDate(sd.getDate() - sd.getDay());
  return sd;
}

function startOfMonth(d: Date): Date {
  const sd = startOfDay(d);
  sd.setDate(1);
  return sd;
}

export function CalendarView({
  saved,
  suggestions,
  onConfirm,
}: CalendarViewProps) {
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const days = mode === 'week' ? 7 : daysInMonthGrid(anchor);
  const gridStart = mode === 'week' ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));

  const buckets = useMemo(() => {
    const out: ContentCalendarEntry[][] = Array.from({ length: days }, () => []);
    const startMs = gridStart.getTime();
    const all = [...saved, ...suggestions];
    for (const e of all) {
      const diff = Math.floor(
        (new Date(e.scheduled_date).getTime() - startMs) / (24 * 60 * 60 * 1000)
      );
      if (diff >= 0 && diff < days) out[diff].push(e);
    }
    out.forEach((b) =>
      b.sort(
        (a, x) =>
          new Date(a.scheduled_date).getTime() -
          new Date(x.scheduled_date).getTime()
      )
    );
    return out;
  }, [saved, suggestions, gridStart, days]);

  const shiftDays = mode === 'week' ? 7 : 28;
  const today = startOfDay(new Date()).getTime();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor((a) => new Date(a.getTime() - shiftDays * 86400000))}
            className="px-3 py-1.5 text-sm text-a7-text/50 hover:text-a7-text rounded transition-colors"
            style={{ border: '1px solid rgba(245,240,232,0.06)' }}
          >
            &larr;
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="px-3 py-1.5 text-sm text-a7-text/60 hover:text-a7-text rounded transition-colors"
            style={{ border: '1px solid rgba(245,240,232,0.06)' }}
          >
            Today
          </button>
          <button
            onClick={() => setAnchor((a) => new Date(a.getTime() + shiftDays * 86400000))}
            className="px-3 py-1.5 text-sm text-a7-text/50 hover:text-a7-text rounded transition-colors"
            style={{ border: '1px solid rgba(245,240,232,0.06)' }}
          >
            &rarr;
          </button>
          <span className="ml-3 text-sm text-a7-text/60">
            {gridStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div
          className="inline-flex rounded-md p-1 gap-1"
          style={{
            background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
            border: '1px solid rgba(245,240,232,0.04)',
          }}
        >
          {(['week', 'month'] as Mode[]).map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all capitalize ${
                  active ? 'text-a7-void' : 'text-a7-text/50 hover:text-a7-text'
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
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`grid gap-2 ${mode === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}
      >
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-[10px] uppercase tracking-wider text-a7-text/30 text-center pb-1"
          >
            {label}
          </div>
        ))}
        {buckets.map((entries, i) => {
          const day = new Date(gridStart.getTime() + i * 86400000);
          const isToday = startOfDay(day).getTime() === today;
          const isOtherMonth =
            mode === 'month' && day.getMonth() !== anchor.getMonth();
          return (
            <DayCell
              key={day.toISOString()}
              day={day}
              entries={entries}
              isToday={isToday}
              dim={isOtherMonth}
              onConfirm={onConfirm}
              compact={mode === 'month'}
            />
          );
        })}
      </div>
    </div>
  );
}

function daysInMonthGrid(_anchor: Date): number {
  return 42;
}

function DayCell({
  day,
  entries,
  isToday,
  dim,
  onConfirm,
  compact,
}: {
  day: Date;
  entries: ContentCalendarEntry[];
  isToday: boolean;
  dim: boolean;
  onConfirm?: (entry: ContentCalendarEntry) => void;
  compact: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-md p-2 min-h-[110px] flex flex-col gap-1.5"
      style={{
        background: isToday
          ? 'linear-gradient(180deg, rgba(45,212,191,0.05), rgba(45,212,191,0.01))'
          : 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: `1px solid ${isToday ? 'rgba(45,212,191,0.18)' : 'rgba(245,240,232,0.04)'}`,
        opacity: dim ? 0.45 : 1,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${isToday ? 'text-grad-teal font-semibold' : 'text-a7-text/40'}`}
        >
          {day.getDate()}
        </span>
        {entries.length > 0 && (
          <span className="text-[10px] text-a7-text/30">{entries.length}</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {entries.slice(0, compact ? 2 : 4).map((e) => (
          <SlotChip key={e.id} entry={e} onConfirm={onConfirm} compact={compact} />
        ))}
        {entries.length > (compact ? 2 : 4) && (
          <span className="text-[10px] text-a7-text/30">
            +{entries.length - (compact ? 2 : 4)} more
          </span>
        )}
      </div>
    </div>
  );
}

function SlotChip({
  entry,
  onConfirm,
  compact,
}: {
  entry: ContentCalendarEntry;
  onConfirm?: (entry: ContentCalendarEntry) => void;
  compact: boolean;
}) {
  const accent = platformAccent(entry.platform as StrategyPlatform);
  const isSuggested = entry.status === 'suggested';
  const title = entry.strategy_brief?.title ?? entry.content_type;
  return (
    <button
      onClick={() => onConfirm?.(entry)}
      className="text-left w-full rounded px-1.5 py-1 transition-all hover:brightness-125"
      style={{
        background: accent.bg,
        border: `1px dashed ${isSuggested ? accent.border : 'transparent'}`,
        borderStyle: isSuggested ? 'dashed' : 'solid',
        borderColor: accent.border,
      }}
      title={`${platformLabel(entry.platform as StrategyPlatform)} · ${title}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold" style={{ color: accent.fg }}>
          {formatTime(entry.scheduled_date)}
        </span>
        {!compact && (
          <span className="text-[10px] text-a7-text/50 truncate">
            {platformLabel(entry.platform as StrategyPlatform)}
          </span>
        )}
      </div>
      {!compact && (
        <div className="text-[10px] text-a7-text/70 truncate leading-tight mt-0.5">
          {title}
        </div>
      )}
    </button>
  );
}
