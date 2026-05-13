'use client';

import { useState } from 'react';
import { TrashIcon } from '@/components/ui/icons';

export function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    if (phrase !== 'delete my account') return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-lg p-6"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(239,68,68,0.2)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(239,68,68,0.4), transparent)',
        }}
      />

      <h2 className="text-base font-semibold mb-1" style={{ color: '#EF4444' }}>
        Danger zone
      </h2>
      <p className="text-xs text-a7-text/40 mb-5">
        Deleting your account is permanent. Edits, Style DNA, channel connections,
        and billing history will be removed.
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
          style={{
            background:
              'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#EF4444',
          }}
        >
          <TrashIcon size={12} gradient="copper" />
          Delete account
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <div className="text-xs text-a7-text/60 mb-1.5">
              Type <code className="font-mono text-a7-text">delete my account</code> to confirm.
            </div>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-md bg-a7-base text-sm text-a7-text border border-a7-text/[0.06] focus:outline-none"
              style={{ borderColor: 'rgba(239,68,68,0.3)' }}
            />
          </label>

          {error && (
            <p className="text-sm" style={{ color: '#EF4444' }}>
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={deleteAccount}
              disabled={phrase !== 'delete my account' || busy}
              className="px-4 py-2 rounded-md text-sm font-medium transition-all text-a7-text disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #B91C1C, #EF4444)',
              }}
            >
              {busy ? 'Deleting…' : 'Delete account permanently'}
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setPhrase('');
                setError(null);
              }}
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
    </section>
  );
}
