'use client';

// =============================================================================
// Arrowhead 7 — Vault Browser (client component)
// =============================================================================

import { useCallback, useEffect, useState } from 'react';

interface ConnectedMap {
  google_drive?: { account: string };
  dropbox?: { account: string };
}

type Provider = 'google_drive' | 'dropbox';

interface BrowserItem {
  id: string;
  name: string;
  kind: 'folder' | 'video';
  size?: number;
  // Provider-specific reference
  providerRef: string;
  thumbnailUrl?: string;
  iconUrl?: string;
  modifiedTime?: string;
  durationMs?: number;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number | string;
  thumbnailLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  videoMediaMetadata?: { durationMillis?: string };
}

interface DropboxEntry {
  '.tag': 'file' | 'folder' | 'deleted';
  id: string;
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
}

function formatBytes(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function VaultBrowser({ connected }: { connected: ConnectedMap }) {
  const providers = Object.keys(connected) as Provider[];
  const [provider, setProvider] = useState<Provider | null>(
    providers[0] ?? null
  );
  const [items, setItems] = useState<BrowserItem[]>([]);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedKeys, setImportedKeys] = useState<Record<string, string>>({});

  const loadPage = useCallback(
    async (folderRef: string | undefined) => {
      if (!provider) return;
      setLoading(true);
      setError(null);
      try {
        let url: string;
        if (provider === 'google_drive') {
          url = `/api/vault/google-drive/browse${
            folderRef ? `?folderId=${encodeURIComponent(folderRef)}` : ''
          }`;
        } else {
          url = `/api/vault/dropbox/browse${
            folderRef ? `?path=${encodeURIComponent(folderRef)}` : ''
          }`;
        }
        const res = await fetch(url);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Browse failed (${res.status})`);
        }
        const data = await res.json();

        if (provider === 'google_drive') {
          const files: DriveFile[] = data.files ?? [];
          setItems(
            files.map((f) => ({
              id: f.id,
              name: f.name,
              kind:
                f.mimeType === 'application/vnd.google-apps.folder'
                  ? 'folder'
                  : 'video',
              size: typeof f.size === 'string' ? Number(f.size) : f.size,
              providerRef: f.id,
              thumbnailUrl: f.thumbnailLink,
              iconUrl: f.iconLink,
              modifiedTime: f.modifiedTime,
              durationMs: f.videoMediaMetadata?.durationMillis
                ? Number(f.videoMediaMetadata.durationMillis)
                : undefined,
            }))
          );
        } else {
          const entries: DropboxEntry[] = data.entries ?? [];
          setItems(
            entries
              .filter((e) => e['.tag'] !== 'deleted')
              .map((e) => ({
                id: e.id,
                name: e.name,
                kind: e['.tag'] === 'folder' ? 'folder' : 'video',
                size: e.size,
                providerRef: e.path_lower ?? e.path_display ?? '',
              }))
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'browse_failed');
      } finally {
        setLoading(false);
      }
    },
    [provider]
  );

  useEffect(() => {
    if (provider) {
      setCursorStack([]);
      loadPage(undefined);
    }
  }, [provider, loadPage]);

  function enterFolder(ref: string) {
    setCursorStack((s) => [...s, ref]);
    loadPage(ref);
  }
  function goBack() {
    setCursorStack((s) => {
      const next = s.slice(0, -1);
      loadPage(next[next.length - 1]);
      return next;
    });
  }

  async function importItem(item: BrowserItem) {
    setImportingId(item.id);
    setError(null);
    try {
      const url =
        provider === 'google_drive'
          ? '/api/vault/google-drive/import'
          : '/api/vault/dropbox/import';
      const body =
        provider === 'google_drive'
          ? { fileId: item.providerRef }
          : { path: item.providerRef, name: item.name };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Import failed (${res.status})`);
      }
      const data = await res.json();
      setImportedKeys((m) => ({ ...m, [item.id]: data.key }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'import_failed');
    } finally {
      setImportingId(null);
    }
  }

  if (providers.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center"
        style={{
          background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
          border: '1px solid rgba(245,240,232,0.04)',
        }}
      >
        <p className="text-a7-text/40 text-sm mb-4">
          No cloud storage connected yet.
        </p>
        <a
          href="/dashboard/channels"
          className="inline-block text-xs px-4 py-2 rounded-md font-medium"
          style={{
            background:
              'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))',
            border: '1px solid rgba(45,212,191,0.3)',
            color: '#5BE8D5',
          }}
        >
          Connect a provider
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {providers.map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`text-xs px-3 py-2 rounded-md transition-all ${
              p === provider ? 'font-semibold' : 'text-a7-text/50'
            }`}
            style={
              p === provider
                ? {
                    background:
                      'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(45,212,191,0.04))',
                    border: '1px solid rgba(45,212,191,0.25)',
                    color: '#5BE8D5',
                  }
                : { border: '1px solid rgba(245,240,232,0.06)' }
            }
          >
            {p === 'google_drive' ? 'Google Drive' : 'Dropbox'}
            <span className="text-a7-text/30 ml-2">
              {connected[p]?.account}
            </span>
          </button>
        ))}
      </div>

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

      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
          border: '1px solid rgba(245,240,232,0.04)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-a7-text/[0.04]">
          <button
            disabled={cursorStack.length === 0}
            onClick={goBack}
            className="text-xs text-a7-text/50 hover:text-a7-text disabled:opacity-30"
          >
            ← Back
          </button>
          <span className="text-xs text-a7-text/40">
            {loading ? 'Loading…' : `${items.length} items`}
          </span>
        </div>

        {items.length === 0 && !loading ? (
          <div className="p-8 text-center text-a7-text/40 text-sm">
            This folder is empty (or has no videos).
          </div>
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-md overflow-hidden"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(16,16,14,0.9), rgba(10,10,10,0.95))',
                  border: '1px solid rgba(245,240,232,0.06)',
                }}
              >
                <div
                  className="relative aspect-video flex items-center justify-center"
                  style={{
                    background:
                      item.kind === 'folder'
                        ? 'linear-gradient(135deg, rgba(212,148,74,0.18), rgba(212,148,74,0.04))'
                        : 'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(45,212,191,0.02))',
                  }}
                >
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : item.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.iconUrl} alt="" className="h-8 w-8 opacity-70" />
                  ) : (
                    <span
                      className="text-[10px] font-mono uppercase tracking-wide"
                      style={{ color: item.kind === 'folder' ? '#D4944A' : '#5BE8D5' }}
                    >
                      {item.kind === 'folder' ? 'Folder' : 'Video'}
                    </span>
                  )}
                  {item.kind === 'video' && (
                    <span className="absolute left-2 top-2 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-black/60 text-[#5BE8D5]">
                      Video
                    </span>
                  )}
                  {formatDuration(item.durationMs) && (
                    <span className="absolute right-2 bottom-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-a7-text/85">
                      {formatDuration(item.durationMs)}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm text-a7-text/85 mb-1">{item.name}</div>
                  <div className="flex justify-between gap-2 text-[10px] text-a7-text/35">
                    <span>{item.kind === 'folder' ? 'Folder' : formatBytes(item.size)}</span>
                    {item.modifiedTime && (
                      <span>{new Date(item.modifiedTime).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="px-3 pb-3">
                {item.kind === 'folder' ? (
                  <button
                    onClick={() => enterFolder(item.providerRef)}
                    className="w-full text-xs px-3 py-1.5 rounded-md text-a7-text/70 border border-a7-text/[0.08] hover:text-a7-text"
                  >
                    Open
                  </button>
                ) : importedKeys[item.id] ? (
                  <span className="block text-center text-xs text-a7-text/40 italic">
                    Imported
                  </span>
                ) : (
                  <button
                    disabled={importingId === item.id}
                    onClick={() => importItem(item)}
                    className="w-full text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-50"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))',
                      border: '1px solid rgba(45,212,191,0.3)',
                      color: '#5BE8D5',
                    }}
                  >
                    {importingId === item.id ? 'Importing…' : 'Import'}
                  </button>
                )}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
