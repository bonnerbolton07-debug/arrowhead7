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
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number | string;
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
          <ul className="divide-y divide-a7-text/[0.04]">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-a7-text/[0.02]"
              >
                <span
                  className="text-xs font-mono uppercase tracking-wide"
                  style={{
                    color: item.kind === 'folder' ? '#D4944A' : '#5BE8D5',
                  }}
                >
                  {item.kind === 'folder' ? 'DIR' : 'VID'}
                </span>
                <span className="flex-1 truncate text-sm text-a7-text/80">
                  {item.name}
                </span>
                <span className="text-xs text-a7-text/30 w-20 text-right">
                  {formatBytes(item.size)}
                </span>
                {item.kind === 'folder' ? (
                  <button
                    onClick={() => enterFolder(item.providerRef)}
                    className="text-xs px-3 py-1.5 rounded-md text-a7-text/60 border border-a7-text/[0.08] hover:text-a7-text"
                  >
                    Open
                  </button>
                ) : importedKeys[item.id] ? (
                  <span className="text-xs text-a7-text/40 italic">
                    Imported
                  </span>
                ) : (
                  <button
                    disabled={importingId === item.id}
                    onClick={() => importItem(item)}
                    className="text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-50"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
