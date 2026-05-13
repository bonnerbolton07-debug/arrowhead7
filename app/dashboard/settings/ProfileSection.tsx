'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getClient } from '@/lib/supabase/client';
import { UserIcon } from '@/components/ui/icons';

export function ProfileSection({
  email,
  displayName,
  avatarUrl,
}: {
  email: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(avatarUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dirty =
    name !== displayName ||
    avatar !== (avatarUrl ?? '') ||
    bio.trim().length > 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const supabase = getClient();
      const { error: e } = await supabase
        .from('profiles')
        .update({
          display_name: name.trim() || null,
          avatar_url: avatar.trim() || null,
        })
        .eq('email', email);
      if (e) throw e;
      setSavedAt(Date.now());
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
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

      <h2 className="text-base font-semibold text-a7-text mb-1">Profile</h2>
      <p className="text-xs text-a7-text/40 mb-5">
        How you show up in A7 and on shared edits.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr] gap-5 items-start">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden relative"
          style={{
            background:
              'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(184,115,51,0.06))',
            border: '1px solid rgba(245,240,232,0.08)',
          }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon size={32} gradient="teal" />
          )}
        </div>

        <div className="space-y-4">
          <Field label="Email">
            <input
              value={email}
              disabled
              className="w-full px-3 py-2 rounded-md bg-a7-base text-sm text-a7-text/50 border border-a7-text/[0.06] focus:outline-none cursor-not-allowed"
            />
          </Field>
          <Field label="Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              className="w-full px-3 py-2 rounded-md bg-a7-base text-sm text-a7-text placeholder:text-a7-text/20 border border-a7-text/[0.06] focus:outline-none focus:border-grad-teal/30"
            />
          </Field>
          <Field label="Avatar URL">
            <input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-md bg-a7-base text-sm text-a7-text placeholder:text-a7-text/20 border border-a7-text/[0.06] focus:outline-none focus:border-grad-teal/30"
            />
          </Field>
          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="A short blurb — appears on shared edits."
              className="w-full px-3 py-2 rounded-md bg-a7-base text-sm text-a7-text placeholder:text-a7-text/20 border border-a7-text/[0.06] focus:outline-none focus:border-grad-teal/30 resize-none"
            />
          </Field>

          {error && <p className="text-sm" style={{ color: '#E8B06A' }}>{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-5 py-2 rounded-md text-sm font-medium transition-all text-a7-void disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: dirty ? '0 0 16px rgba(45,212,191,0.2)' : 'none',
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {savedAt && !saving && (
              <span className="text-xs text-grad-teal">Saved</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-a7-text/40 font-mono mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}
