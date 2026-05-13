// =============================================================================
// Arrowhead 7 — Strategy Brain UI: Hook Library Browser
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import type {
  HookCategory,
  HookTemplate,
  StrategyPlatform,
} from '@/types/strategy';
import { HookIcon } from '@/components/ui/icons';

const CATEGORIES: { id: HookCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'curiosity', label: 'Curiosity' },
  { id: 'value', label: 'Value' },
  { id: 'storytelling', label: 'Storytelling' },
  { id: 'pattern-interrupt', label: 'Pattern interrupt' },
  { id: 'controversy', label: 'Controversy' },
  { id: 'authority', label: 'Authority' },
  { id: 'visual-shock', label: 'Visual shock' },
  { id: 'numbered-list', label: 'Lists' },
];

const PLATFORMS: { id: StrategyPlatform | 'all'; label: string }[] = [
  { id: 'all', label: 'All platforms' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'twitter', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
];

interface HookLibraryProps {
  initial?: HookTemplate[];
}

export function HookLibrary({ initial = [] }: HookLibraryProps) {
  const [category, setCategory] = useState<HookCategory | 'all'>('all');
  const [platform, setPlatform] = useState<StrategyPlatform | 'all'>('all');
  const [hooks, setHooks] = useState<HookTemplate[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);

  useEffect(() => {
    let cancelled = false;
    const fetchHooks = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (platform !== 'all') params.set('platform', platform);
      try {
        const res = await fetch(`/api/strategy/hooks?${params.toString()}`);
        if (!res.ok) throw new Error('Failed');
        const data: { hooks: HookTemplate[] } = await res.json();
        if (!cancelled) setHooks(data.hooks);
      } catch {
        if (!cancelled) setHooks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchHooks();
    return () => {
      cancelled = true;
    };
  }, [category, platform]);

  return (
    <section>
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <HookIcon size={20} gradient="copper" />
          <h3 className="text-lg font-semibold text-a7-text">Hook Library</h3>
          <span className="text-xs text-a7-text/30">{hooks.length} patterns</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as HookCategory | 'all')}
            options={CATEGORIES}
          />
          <Select
            label="Platform"
            value={platform}
            onChange={(v) => setPlatform(v as StrategyPlatform | 'all')}
            options={PLATFORMS}
          />
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-a7-text/40 p-8 text-center">Loading hooks…</div>
      ) : hooks.length === 0 ? (
        <div className="text-sm text-a7-text/40 p-8 text-center">
          No hooks match those filters.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {hooks.map((hook) => (
            <HookCard key={hook.id} hook={hook} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HookCard({ hook }: { hook: HookTemplate }) {
  return (
    <li
      className="relative overflow-hidden rounded-md p-4 flex flex-col gap-2"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(184,115,51,0.2), transparent)',
        }}
      />
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-a7-text">{hook.name}</h4>
        <span className="text-[10px] uppercase tracking-wider text-a7-text/40">
          {hook.category}
        </span>
      </div>
      <code className="text-xs text-grad-copper bg-a7-text/[0.02] px-2 py-1 rounded font-mono">
        {hook.pattern}
      </code>
      <p className="text-xs text-a7-text/50 italic leading-relaxed">
        Ex: &ldquo;{hook.example}&rdquo;
      </p>
      <p className="text-xs text-a7-text/40 leading-relaxed">{hook.description}</p>
      <div className="flex items-center justify-between text-[10px] text-a7-text/40 mt-1">
        <span>{hook.attention_seconds}s attention hold</span>
        <span>{hook.best_for_platforms.length} platforms</span>
      </div>
    </li>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-a7-text/40">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-a7-base text-a7-text text-xs px-2 py-1 rounded outline-none"
        style={{ border: '1px solid rgba(245,240,232,0.06)' }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
