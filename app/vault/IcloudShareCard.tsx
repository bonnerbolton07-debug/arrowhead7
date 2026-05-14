'use client';

import { useState } from 'react';
import { ICloudIcon } from '@/components/ui/icons';

interface Props {
  /** Whether the user has already imported anything via iCloud share link. */
  connected: boolean;
  connectedAccount?: string | null;
}

/**
 * Apple doesn't expose an OAuth/REST API for third-party iCloud Drive access
 * without a paid Developer-account + CloudKit JS. This card uses the only
 * public Apple-supported alternative: iCloud Drive share links. The user
 * shares a file from the Files app (Share → Copy Link), pastes it here, and
 * we resolve+stream the bytes to R2 via /api/vault/icloud/import.
 */
export function IcloudShareCard({ connected, connectedAccount }: Props) {
  const [shareUrl, setShareUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/vault/icloud/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareUrl: shareUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Import failed (${res.status})`);
      }
      setSuccess(`Imported ${data.name}`);
      setShareUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-lg p-5 flex flex-col"
      style={{
        background: connected
          ? 'linear-gradient(135deg, rgba(45,212,191,0.05), rgba(45,212,191,0.01))'
          : 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: connected
          ? '1px solid rgba(45,212,191,0.15)'
          : '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: connected
            ? 'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)'
            : 'linear-gradient(90deg, rgba(245,240,232,0.08), transparent)',
        }}
      />

      <div className="flex items-start justify-between mb-4">
        <ICloudIcon size={28} />
        {connected && (
          <span
            className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(45,212,191,0.08)',
              color: '#2DD4BF',
              border: '1px solid rgba(45,212,191,0.2)',
            }}
          >
            share-link
          </span>
        )}
      </div>

      <h3 className="font-semibold text-sm text-a7-text mb-1">iCloud Drive</h3>
      <p className="text-xs text-a7-text/40 mb-3 flex-1">
        {connected
          ? connectedAccount ?? 'Share-link imports'
          : 'Paste a public iCloud share link and we’ll pull the file in.'}
      </p>

      <div className="space-y-2">
        <input
          type="url"
          value={shareUrl}
          onChange={(e) => setShareUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy && shareUrl.trim()) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="https://www.icloud.com/iclouddrive/…"
          disabled={busy}
          className="w-full px-3 py-2 rounded-md text-xs bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/30 focus:outline-none focus:border-grad-teal disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !shareUrl.trim()}
          className="w-full px-3 py-2 rounded-md text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
            color: '#0A0A0A',
            boxShadow: !busy && shareUrl.trim() ? '0 0 12px rgba(45,212,191,0.2)' : 'none',
          }}
        >
          {busy ? 'Importing…' : 'Import from iCloud'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[11px] break-words" style={{ color: '#E8B06A' }}>
          {error}
        </p>
      )}
      {success && (
        <p className="mt-2 text-[11px] break-words" style={{ color: '#2DD4BF' }}>
          {success}
        </p>
      )}

      <p className="mt-3 text-[10px] text-a7-text/30 leading-relaxed">
        On iPhone/Mac: tap Share → Copy Link in the Files app. Make sure
        sharing is set to “Anyone with the link”.
      </p>
    </div>
  );
}
