'use client';

// =============================================================================
// Arrowhead 7 — Vault Picker
// =============================================================================
// Modal-style picker for selecting vault files from inside the editor. The
// caller specifies which folder to default to (`references` for the reference
// step, `footage` for the footage step) and which kinds are allowed. Returns
// the chosen `VaultFile` rows back via `onSelect`.

import { useEffect, useMemo, useState } from 'react';
import type { VaultFile, VaultFolder, VaultKind } from '@/lib/vault';
import { VaultIcon } from '@/components/ui/icons';

interface Props {
  open: boolean;
  defaultFolder: VaultFolder;
  allowedKinds: VaultKind[];
  multiple?: boolean;
  onClose: () => void;
  onSelect: (files: VaultFile[]) => void;
}

function formatBytes(n: number) {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function VaultPicker({
  open,
  defaultFolder,
  allowedKinds,
  multiple = true,
  onClose,
  onSelect,
}: Props) {
  const [folder, setFolder] = useState<VaultFolder>(defaultFolder);
  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setFiles(null);
      return;
    }
    setFolder(defaultFolder);
  }, [open, defaultFolder]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        const res = await fetch('/api/vault/files', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Vault load failed (${res.status})`);
        }
        const data = (await res.json()) as { files: VaultFile[] };
        if (!cancelled) setFiles(data.files);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const allowed = useMemo(() => new Set(allowedKinds), [allowedKinds]);
  const visible = useMemo(() => {
    if (!files) return [];
    return files.filter((f) => f.folder === folder && allowed.has(f.kind));
  }, [files, folder, allowed]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const confirm = () => {
    if (!files) return;
    const chosen = files.filter((f) => selected.has(f.id));
    if (chosen.length === 0) return;
    onSelect(chosen);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(16,16,14,0.98), rgba(10,10,10,0.98))',
          border: '1px solid rgba(245,240,232,0.08)',
          boxShadow: '0 0 40px rgba(45,212,191,0.08)',
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(45,212,191,0.35), rgba(184,115,51,0.25), transparent)',
          }}
        />

        <div className="px-6 py-4 flex items-center gap-3 border-b border-a7-text/[0.06]">
          <VaultIcon size={20} gradient="dual" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-a7-text">Pick from your vault</div>
            <div className="text-[11px] text-a7-text/40">
              Files you've already imported are ready to use here.
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-a7-text/40 hover:text-a7-text"
            style={{ border: '1px solid rgba(245,240,232,0.08)' }}
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 px-6 py-3 border-b border-a7-text/[0.04]">
          {(['references', 'footage', 'exports'] as VaultFolder[]).map((f) => {
            const active = f === folder;
            return (
              <button
                key={f}
                onClick={() => setFolder(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${active ? 'text-grad-teal' : 'text-a7-text/50 hover:text-a7-text'}`}
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(45,212,191,0.04))',
                        border: '1px solid rgba(45,212,191,0.2)',
                      }
                    : { border: '1px solid rgba(245,240,232,0.06)' }
                }
              >
                /{f}
              </button>
            );
          })}
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {error && (
            <div className="m-4 px-4 py-3 rounded-md text-sm" style={{ color: '#E8B06A', border: '1px solid rgba(232,176,106,0.25)' }}>
              {error}
            </div>
          )}
          {files === null && !error && (
            <div className="p-10 text-center text-sm text-a7-text/40">Loading vault…</div>
          )}
          {files !== null && visible.length === 0 && !error && (
            <div className="p-10 text-center">
              <p className="text-sm text-a7-text/50 mb-3">
                No matching files in /{folder} yet.
              </p>
              <a
                href="/vault"
                className="inline-block text-xs px-4 py-2 rounded-md text-grad-teal"
                style={{
                  background: 'rgba(45,212,191,0.06)',
                  border: '1px solid rgba(45,212,191,0.2)',
                }}
              >
                Add files in /vault →
              </a>
            </div>
          )}
          {visible.length > 0 && (
            <ul className="divide-y divide-a7-text/[0.04]">
              {visible.map((f) => {
                const picked = selected.has(f.id);
                return (
                  <li
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    className="px-6 py-3 flex items-center gap-3 cursor-pointer transition-colors"
                    style={{
                      background: picked ? 'rgba(45,212,191,0.05)' : 'transparent',
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{
                        background: picked
                          ? 'linear-gradient(135deg, #1a9e8f, #2DD4BF)'
                          : 'transparent',
                        border: picked ? 'none' : '1px solid rgba(245,240,232,0.18)',
                      }}
                    >
                      {picked && (
                        <svg viewBox="0 0 24 24" width="10" height="10" stroke="#0A0A0A" strokeWidth="3" fill="none">
                          <polyline points="5 12 10 17 19 8" />
                        </svg>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-mono uppercase tracking-wider w-10"
                      style={{
                        color:
                          f.kind === 'image'
                            ? '#D4944A'
                            : f.kind === 'video'
                            ? '#5BE8D5'
                            : 'rgba(245,240,232,0.4)',
                      }}
                    >
                      {f.kind === 'image' ? 'IMG' : f.kind === 'video' ? 'VID' : f.kind === 'audio' ? 'AUD' : 'FILE'}
                    </span>
                    <span className="flex-1 truncate text-sm text-a7-text/85">{f.filename}</span>
                    <span className="text-[11px] text-a7-text/30 w-16 text-right">
                      {formatBytes(f.size_bytes)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 flex items-center justify-between border-t border-a7-text/[0.06]">
          <div className="text-xs text-a7-text/40">
            {selected.size > 0 ? `${selected.size} selected` : 'Click a row to select'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm text-a7-text/50"
              style={{ border: '1px solid rgba(245,240,232,0.06)' }}
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={selected.size === 0}
              className="px-4 py-2 rounded-md text-sm font-medium text-a7-void disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: selected.size > 0 ? '0 0 14px rgba(45,212,191,0.22)' : 'none',
              }}
            >
              {multiple ? 'Add to edit' : 'Use this file'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
