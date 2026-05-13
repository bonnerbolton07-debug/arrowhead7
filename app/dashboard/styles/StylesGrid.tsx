'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DnaIcon, EditIcon, TrashIcon, PaceIcon, ColorIcon } from '@/components/ui/icons';
import { getClient } from '@/lib/supabase/client';
import type { StyleListRow } from './types';

export function StylesGrid({ styles }: { styles: StyleListRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function saveName(id: string) {
    if (!draftName.trim()) {
      setEditingId(null);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const supabase = getClient();
      const { error: e } = await supabase
        .from('style_dna')
        .update({ name: draftName.trim() })
        .eq('id', id);
      if (e) throw e;
      setEditingId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteStyle(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    setBusyId(id);
    setError(null);
    try {
      const supabase = getClient();
      const { error: e } = await supabase.from('style_dna').delete().eq('id', id);
      if (e) throw e;
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-md text-sm"
          style={{
            background:
              'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
            border: '1px solid rgba(212,148,74,0.25)',
            color: '#E8B06A',
          }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {styles.map((s) => (
          <div
            key={s.id}
            className="relative overflow-hidden rounded-lg flex flex-col"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.05)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)',
              }}
            />

            {/* Palette band */}
            <div className="h-24 flex relative overflow-hidden">
              {s.palette.length > 0 ? (
                s.palette.map((c, i) => (
                  <div
                    key={i}
                    className="flex-1 transition-all"
                    style={{ background: c }}
                  />
                ))
              ) : (
                <div className="flex-1 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(184,115,51,0.04))' }}>
                  <DnaIcon size={28} gradient="copper" className="opacity-40" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-1/3"
                style={{ background: 'linear-gradient(180deg, transparent, rgba(10,10,10,0.7))' }} />
            </div>

            <div className="p-4 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                {editingId === s.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => saveName(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName(s.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="bg-a7-base border border-grad-teal/30 rounded px-2 py-1 text-sm text-a7-text flex-1 focus:outline-none"
                  />
                ) : (
                  <h3 className="font-semibold text-sm text-a7-text flex-1 truncate">
                    {s.name}
                  </h3>
                )}
                <StatusPill status={s.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <Stat
                  Icon={PaceIcon}
                  label="BPM"
                  value={s.bpm_target ? String(Math.round(s.bpm_target)) : '—'}
                  accent="teal"
                />
                <Stat
                  Icon={PaceIcon}
                  label="CPM"
                  value={s.cuts_per_minute ? String(Math.round(s.cuts_per_minute)) : '—'}
                  accent="copper"
                />
                <Stat
                  Icon={ColorIcon}
                  label="Energy"
                  value={s.energy ?? '—'}
                  accent="copper"
                />
                <Stat
                  Icon={ColorIcon}
                  label="Cut len"
                  value={
                    s.avg_cut_duration_ms
                      ? `${(s.avg_cut_duration_ms / 1000).toFixed(1)}s`
                      : '—'
                  }
                  accent="teal"
                />
              </div>

              <div className="flex gap-2 mt-auto">
                <a
                  href={`/editor?styleId=${s.id}`}
                  className="flex-1 px-3 py-2 rounded-md text-xs font-medium text-center transition-all text-a7-void"
                  style={{
                    background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                  }}
                >
                  Use style
                </a>
                <button
                  onClick={() => {
                    setEditingId(s.id);
                    setDraftName(s.name);
                  }}
                  disabled={busyId === s.id}
                  className="px-3 py-2 rounded-md text-xs font-medium transition-all"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                    border: '1px solid rgba(245,240,232,0.06)',
                    color: 'rgba(245,240,232,0.6)',
                  }}
                  aria-label="Rename style"
                >
                  <EditIcon size={12} gradient="teal" />
                </button>
                <button
                  onClick={() => deleteStyle(s.id, s.name)}
                  disabled={busyId === s.id}
                  className="px-3 py-2 rounded-md text-xs font-medium transition-all"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.01))',
                    border: '1px solid rgba(184,115,51,0.1)',
                    color: '#D4944A',
                  }}
                  aria-label="Delete style"
                >
                  <TrashIcon size={12} gradient="copper" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({
  Icon,
  label,
  value,
  accent,
}: {
  Icon: typeof PaceIcon;
  label: string;
  value: string;
  accent: 'teal' | 'copper';
}) {
  return (
    <div
      className="rounded px-2 py-1.5 flex items-center gap-2"
      style={{
        background: '#0C0C0A',
        border: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      <Icon size={12} gradient={accent} />
      <div className="min-w-0">
        <div className="text-[10px] text-a7-text/30 uppercase tracking-wider font-mono leading-none">
          {label}
        </div>
        <div className="text-a7-text text-xs truncate leading-snug">{value}</div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'analyzing' | 'ready' | 'failed' }) {
  const color =
    status === 'ready' ? '#2DD4BF' : status === 'failed' ? '#EF4444' : '#D4944A';
  return (
    <span
      className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-full shrink-0"
      style={{
        background: `${color}14`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {status}
    </span>
  );
}
