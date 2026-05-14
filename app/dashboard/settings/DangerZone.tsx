'use client';

import { useEffect, useState } from 'react';
import { TrashIcon } from '@/components/ui/icons';

const CONFIRM_PHRASE = 'DELETE';

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setPhrase('');
    setError(null);
  }

  async function deleteAccount() {
    if (phrase !== CONFIRM_PHRASE) return;
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

      <button
        onClick={() => setOpen(true)}
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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="danger-modal-title"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-lg p-6"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(239,68,68,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="danger-modal-title"
              className="text-base font-semibold mb-2"
              style={{ color: '#EF4444' }}
            >
              Delete account permanently?
            </h3>
            <p className="text-sm text-a7-text/60 mb-4 leading-relaxed">
              This will permanently delete your account, all edits, Style DNA, channel
              connections, and billing history. <strong className="text-a7-text">This
              cannot be undone.</strong>
            </p>

            <label className="block mb-4">
              <div className="text-xs text-a7-text/60 mb-1.5">
                Type <code className="font-mono text-a7-text">{CONFIRM_PHRASE}</code> to confirm.
              </div>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-md bg-a7-base text-sm text-a7-text focus:outline-none"
                style={{ border: '1px solid rgba(239,68,68,0.3)' }}
              />
            </label>

            {error && (
              <p className="text-sm mb-3" style={{ color: '#EF4444' }}>
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={busy}
                className="px-4 py-2 rounded-md text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(245,240,232,0.06)',
                  color: 'rgba(245,240,232,0.6)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={phrase !== CONFIRM_PHRASE || busy}
                className="px-4 py-2 rounded-md text-sm font-medium transition-all text-a7-text disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #B91C1C, #EF4444)',
                }}
              >
                {busy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
