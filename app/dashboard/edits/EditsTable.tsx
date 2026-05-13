'use client';

import { useMemo, useState } from 'react';
import { FilmIcon, DnaIcon, ClockIcon, SearchIcon } from '@/components/ui/icons';
import type { EditListRow } from './types';
import type { EditStatus } from '@/types';

type StatusFilter = 'all' | EditStatus;
type SortKey = 'newest' | 'oldest' | 'title';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'rendering', label: 'Rendering' },
  { value: 'completed', label: 'Complete' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: '#8FF0E5',
  analyzing: '#5BE8D5',
  ready: '#2DD4BF',
  queued: '#D4944A',
  rendering: '#D4944A',
  completed: '#2DD4BF',
  failed: '#EF4444',
  cancelled: '#6B3A1A',
};

export function EditsTable({ edits }: { edits: EditListRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [styleFilter, setStyleFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');

  const styles = useMemo(() => {
    const set = new Map<string, string>();
    for (const e of edits) {
      if (e.style_dna_id && e.style_dna_name) set.set(e.style_dna_id, e.style_dna_name);
    }
    return Array.from(set.entries());
  }, [edits]);

  const filtered = useMemo(() => {
    let rows = edits;
    if (statusFilter !== 'all') rows = rows.filter((e) => e.status === statusFilter);
    if (styleFilter !== 'all') rows = rows.filter((e) => e.style_dna_id === styleFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.style_dna_name?.toLowerCase().includes(q) ?? false)
      );
    }

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.created_at.localeCompare(b.created_at);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'newest':
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
    return rows;
  }, [edits, statusFilter, styleFilter, sort, query]);

  if (edits.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      {/* Filter bar */}
      <div
        className="rounded-lg p-3 mb-5 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center"
        style={{
          background: 'linear-gradient(180deg, rgba(16,16,14,0.6), rgba(10,10,10,0.6))',
          border: '1px solid rgba(245,240,232,0.05)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md flex-1 min-w-0"
          style={{ background: '#0C0C0A', border: '1px solid rgba(245,240,232,0.06)' }}
        >
          <SearchIcon size={14} gradient="teal" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search edits..."
            className="bg-transparent text-sm text-a7-text placeholder:text-a7-text/20 focus:outline-none w-full"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          />
          {styles.length > 0 && (
            <Select
              label="Style"
              value={styleFilter}
              onChange={setStyleFilter}
              options={[
                { value: 'all', label: 'All styles' },
                ...styles.map(([id, name]) => ({ value: id, label: name })),
              ]}
            />
          )}
          <Select
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'title', label: 'Title (A–Z)' },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-lg p-12 text-center"
          style={{
            background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
            border: '1px solid rgba(245,240,232,0.04)',
          }}
        >
          <p className="text-a7-text/40 text-sm">No edits match these filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e) => (
            <EditCard key={e.id} edit={e} />
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-a7-text/30">
        Showing {filtered.length} of {edits.length}
      </div>
    </div>
  );
}

function EditCard({ edit }: { edit: EditListRow }) {
  const color = STATUS_COLORS[edit.status] ?? '#F5F0E8';
  const isActionable = edit.status === 'completed' && edit.output_video_url;
  const href = isActionable
    ? edit.output_video_url ?? '#'
    : `/editor?id=${edit.id}`;

  return (
    <a
      href={href}
      target={isActionable ? '_blank' : undefined}
      rel={isActionable ? 'noopener noreferrer' : undefined}
      className="relative overflow-hidden rounded-lg transition-all hover:scale-[1.01] block group"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, ${color}40, transparent)`,
        }}
      />
      <div
        className="aspect-video flex items-center justify-center relative overflow-hidden"
        style={{
          background: edit.output_thumbnail_url
            ? `url(${edit.output_thumbnail_url}) center/cover`
            : 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(184,115,51,0.04))',
        }}
      >
        {!edit.output_thumbnail_url && (
          <FilmIcon size={36} gradient="teal" className="opacity-30" />
        )}
        {edit.status === 'rendering' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-xs font-mono text-grad-copper">RENDERING</div>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="font-medium text-sm text-a7-text truncate flex-1">
            {edit.title}
          </h4>
          <span
            className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full shrink-0"
            style={{
              background: `${color}14`,
              color,
              border: `1px solid ${color}33`,
            }}
          >
            {edit.status}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-a7-text/30">
          <span className="inline-flex items-center gap-1">
            <ClockIcon size={11} gradient="teal" />
            {new Date(edit.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          {edit.style_dna_name && (
            <span className="inline-flex items-center gap-1 truncate">
              <DnaIcon size={11} gradient="copper" />
              {edit.style_dna_name}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

function EmptyState() {
  return (
    <div
      className="relative overflow-hidden rounded-lg p-16 text-center"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(45,212,191,0.1), rgba(184,115,51,0.08), transparent)',
        }}
      />
      <FilmIcon size={36} gradient="teal" className="mx-auto mb-4 opacity-40" />
      <h3 className="text-base font-semibold text-a7-text mb-1">No edits yet</h3>
      <p className="text-a7-text/40 text-sm mb-6 max-w-sm mx-auto">
        Drop in a reference video and your raw footage. A7 will assemble the edit
        and you&rsquo;ll see it here.
      </p>
      <a
        href="/editor"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-medium text-sm transition-all text-a7-void"
        style={{
          background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
          boxShadow: '0 0 18px rgba(45,212,191,0.25)',
        }}
      >
        Create your first edit
      </a>
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
      style={{ background: '#0C0C0A', border: '1px solid rgba(245,240,232,0.06)' }}>
      <span className="text-a7-text/30 uppercase tracking-wider font-mono">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-transparent text-a7-text text-sm focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-a7-base">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
