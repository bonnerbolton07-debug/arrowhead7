'use client';

import { useState } from 'react';
import { getClient } from '@/lib/supabase/client';
import { BellIcon } from '@/components/ui/icons';

interface Prefs {
  email_render_complete: boolean;
  email_render_failed: boolean;
  email_billing: boolean;
  email_product_updates: boolean;
  email_security_alerts: boolean;
  in_app_render_complete: boolean;
  in_app_render_failed: boolean;
  in_app_distribution_done: boolean;
}

const FIELDS: { key: keyof Prefs; label: string; desc: string; group: 'email' | 'app' }[] = [
  { key: 'email_render_complete', label: 'Render complete', desc: 'When an edit finishes rendering.', group: 'email' },
  { key: 'email_render_failed', label: 'Render failed', desc: 'When something breaks during render.', group: 'email' },
  { key: 'email_billing', label: 'Billing & receipts', desc: 'Charges, refunds, plan changes.', group: 'email' },
  { key: 'email_product_updates', label: 'Product updates', desc: 'New features and changelog highlights.', group: 'email' },
  { key: 'email_security_alerts', label: 'Security alerts', desc: 'New logins and account changes.', group: 'email' },
  { key: 'in_app_render_complete', label: 'Render complete', desc: 'Push a notification in-app.', group: 'app' },
  { key: 'in_app_render_failed', label: 'Render failed', desc: 'In-app failure alerts.', group: 'app' },
  { key: 'in_app_distribution_done', label: 'Distribution complete', desc: 'When a post lands on a channel.', group: 'app' },
];

export function NotificationSection({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save(next: Prefs) {
    setSaving(true);
    setError(null);
    try {
      const supabase = getClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not signed in');
      const { error: e } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: u.user.id, ...next });
      if (e) throw e;
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    void save(next);
  }

  return (
    <section
      className="relative overflow-hidden rounded-lg p-6"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)',
        }}
      />

      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-base font-semibold text-a7-text mb-1 flex items-center gap-2">
            <BellIcon size={14} gradient="teal" />
            Notifications
          </h2>
          <p className="text-xs text-a7-text/40">
            Choose what we ping you about.
          </p>
        </div>
        <div className="text-xs">
          {saving && <span className="text-a7-text/40">Saving…</span>}
          {savedAt && !saving && <span className="text-grad-teal">Saved</span>}
        </div>
      </div>

      {error && (
        <p className="text-sm mb-3" style={{ color: '#E8B06A' }}>
          {error}
        </p>
      )}

      <div className="space-y-5">
        <PrefGroup
          title="Email"
          fields={FIELDS.filter((f) => f.group === 'email')}
          prefs={prefs}
          onToggle={toggle}
        />
        <PrefGroup
          title="In-app"
          fields={FIELDS.filter((f) => f.group === 'app')}
          prefs={prefs}
          onToggle={toggle}
        />
      </div>
    </section>
  );
}

function PrefGroup({
  title,
  fields,
  prefs,
  onToggle,
}: {
  title: string;
  fields: typeof FIELDS;
  prefs: Prefs;
  onToggle: (key: keyof Prefs) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-a7-text/40 font-mono mb-2">
        {title}
      </div>
      <ul className="space-y-2">
        {fields.map((f) => (
          <li
            key={f.key}
            className="flex items-center justify-between px-3 py-2 rounded-md"
            style={{ background: '#0C0C0A', border: '1px solid rgba(245,240,232,0.04)' }}
          >
            <div className="min-w-0 mr-3">
              <div className="text-sm text-a7-text">{f.label}</div>
              <div className="text-[10px] text-a7-text/30">{f.desc}</div>
            </div>
            <Toggle on={prefs[f.key]} onChange={() => onToggle(f.key)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={on}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors"
      style={{
        background: on
          ? 'linear-gradient(135deg, #1a9e8f, #2DD4BF)'
          : 'rgba(245,240,232,0.08)',
        boxShadow: on ? '0 0 10px rgba(45,212,191,0.25)' : 'none',
      }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-a7-text transition-transform"
        style={{
          transform: on ? 'translateX(18px)' : 'translateX(2px)',
          marginTop: 2,
        }}
      />
    </button>
  );
}
