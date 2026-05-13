'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getClient } from '@/lib/supabase/client';
import { KeyIcon, TrashIcon } from '@/components/ui/icons';
import { hasApiAccess } from '@/lib/stripe/gating';
import type { SubscriptionTier } from '@/types';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function ApiKeysSection({
  tier,
  keys,
}: {
  tier: SubscriptionTier;
  keys: ApiKey[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gated = !hasApiAccess(tier);

  async function createKey() {
    if (!newKeyName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Generate a random key client-side, hash it for storage. The full key
      // is shown to the user once and never again.
      const raw = generateKey();
      const prefix = raw.slice(0, 11); // "a7sk_" + 6 chars
      const hashed = await sha256(raw);

      const supabase = getClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not signed in');

      const { error: e } = await supabase.from('api_keys').insert({
        user_id: u.user.id,
        name: newKeyName.trim(),
        prefix,
        hashed_key: hashed,
        scopes: ['read', 'write'],
      });
      if (e) throw e;

      setCreatedKey(raw);
      setNewKeyName('');
      setCreating(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this key? Anything using it will stop working immediately.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getClient();
      const { error: e } = await supabase
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);
      if (e) throw e;
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setBusy(false);
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
          background: 'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)',
        }}
      />

      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-base font-semibold text-a7-text mb-1 flex items-center gap-2">
            <KeyIcon size={14} gradient="copper" />
            API keys
          </h2>
          <p className="text-xs text-a7-text/40">
            Programmatic access to A7. Studio tier only.
          </p>
        </div>
        {!gated && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all text-a7-void"
            style={{
              background: 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)',
              boxShadow: '0 0 14px rgba(184,115,51,0.2)',
            }}
          >
            Create key
          </button>
        )}
      </div>

      {gated ? (
        <UpgradePrompt />
      ) : (
        <>
          {createdKey && (
            <div
              className="px-4 py-3 mb-4 rounded-md text-sm"
              style={{
                background:
                  'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(45,212,191,0.02))',
                border: '1px solid rgba(45,212,191,0.25)',
              }}
            >
              <div className="font-medium text-grad-teal mb-2">
                Copy this key — you won&rsquo;t see it again.
              </div>
              <code className="block w-full font-mono text-xs px-3 py-2 rounded bg-a7-base text-a7-text break-all">
                {createdKey}
              </code>
              <button
                onClick={() => setCreatedKey(null)}
                className="mt-3 text-xs text-a7-text/50 hover:text-a7-text"
              >
                I&rsquo;ve copied it →
              </button>
            </div>
          )}

          {creating && (
            <div
              className="px-4 py-3 mb-4 rounded-md"
              style={{
                background: '#0C0C0A',
                border: '1px solid rgba(184,115,51,0.2)',
              }}
            >
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. 'CI server')"
                  className="flex-1 px-3 py-2 rounded-md bg-a7-void text-sm text-a7-text placeholder:text-a7-text/20 border border-a7-text/[0.06] focus:outline-none focus:border-grad-copper/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newKeyName.trim()) createKey();
                    if (e.key === 'Escape') setCreating(false);
                  }}
                />
                <button
                  onClick={createKey}
                  disabled={!newKeyName.trim() || busy}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-all text-a7-void disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)',
                  }}
                >
                  {busy ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="px-4 py-2 rounded-md text-sm transition-all"
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(245,240,232,0.06)',
                    color: 'rgba(245,240,232,0.5)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm mb-3" style={{ color: '#E8B06A' }}>
              {error}
            </p>
          )}

          {keys.length === 0 ? (
            <p className="text-sm text-a7-text/40">
              No keys yet. Create one to start using the A7 API.
            </p>
          ) : (
            <ul className="space-y-2">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between px-3 py-3 rounded-md"
                  style={{
                    background: '#0C0C0A',
                    border: '1px solid rgba(245,240,232,0.04)',
                  }}
                >
                  <div className="min-w-0 mr-3 flex-1">
                    <div className="font-medium text-sm text-a7-text">{k.name}</div>
                    <div className="text-[10px] font-mono text-a7-text/40">
                      {k.prefix}…&nbsp;·&nbsp;Created{' '}
                      {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used_at &&
                        ` · Used ${new Date(k.last_used_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(k.id)}
                    disabled={busy}
                    aria-label="Revoke key"
                    className="px-2 py-1.5 rounded-md transition-all"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.01))',
                      border: '1px solid rgba(184,115,51,0.15)',
                    }}
                  >
                    <TrashIcon size={12} gradient="copper" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function UpgradePrompt() {
  return (
    <div
      className="px-4 py-5 rounded-md text-sm"
      style={{
        background:
          'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.02))',
        border: '1px solid rgba(184,115,51,0.2)',
      }}
    >
      <div className="text-a7-text mb-1">API access is part of the Studio plan.</div>
      <div className="text-a7-text/50 text-xs mb-3">
        Build pipelines, integrate A7 into your stack, automate edits at scale.
      </div>
      <a
        href="/pricing"
        className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md text-a7-void transition-all"
        style={{
          background: 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)',
          boxShadow: '0 0 12px rgba(184,115,51,0.2)',
        }}
      >
        Upgrade to Studio →
      </a>
    </div>
  );
}

function generateKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `a7sk_${hex}`;
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
