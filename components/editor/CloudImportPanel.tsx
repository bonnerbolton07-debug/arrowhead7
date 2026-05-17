'use client';

// =============================================================================
// Arrowhead 7 — Cloud Import Panel
// =============================================================================
// Lets the user pull footage server-to-server from Google Drive, Dropbox, or
// an iCloud share link instead of uploading from their phone. The component
// hands the resulting R2 key + editId back to the editor.

import { useEffect, useState } from 'react';
import {
  GoogleDriveIcon,
  DropboxIcon,
  ICloudIcon,
} from '@/components/ui/icons';

export type CloudProviderId = 'google_drive' | 'dropbox' | 'icloud' | 'url';

export interface ImportedSource {
  editId: string;
  key: string;
  name: string;
  size: number;
  mimeType: string;
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

interface BrowserItem {
  id: string;
  name: string;
  kind: 'folder' | 'video';
  size?: number;
  providerRef: string;
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

interface Props {
  /** Called once a file has been pulled into R2. */
  onImported: (src: ImportedSource) => void;
  /** Optional className for layout integration. */
  className?: string;
}

export function CloudImportPanel({ onImported, className }: Props) {
  const [providers, setProviders] = useState<{
    google_drive: boolean;
    dropbox: boolean;
    google_drive_configured: boolean;
    dropbox_configured: boolean;
  }>({
    google_drive: false,
    dropbox: false,
    google_drive_configured: false,
    dropbox_configured: false,
  });
  const [provider, setProvider] = useState<CloudProviderId>('google_drive');
  const [loadingProviders, setLoadingProviders] = useState(true);

  const [items, setItems] = useState<BrowserItem[]>([]);
  const [stack, setStack] = useState<string[]>([]);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [shareUrl, setShareUrl] = useState('');
  const [genericUrl, setGenericUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/connections', { cache: 'no-store' });
        if (!res.ok) throw new Error(`status_${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setProviders({
            google_drive: !!data.google_drive,
            dropbox: !!data.dropbox,
            google_drive_configured: !!data.google_drive_configured,
            dropbox_configured: !!data.dropbox_configured,
          });
          // Default to first connected provider when present.
          if (data.google_drive) setProvider('google_drive');
          else if (data.dropbox) setProvider('dropbox');
          else setProvider('icloud');
        }
      } catch {
        // Treat as no connections.
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadFolder(ref: string | undefined) {
    if (provider !== 'google_drive' && provider !== 'dropbox') return;
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const url =
        provider === 'google_drive'
          ? `/api/vault/google-drive/browse${
              ref ? `?folderId=${encodeURIComponent(ref)}` : ''
            }`
          : `/api/vault/dropbox/browse${
              ref ? `?path=${encodeURIComponent(ref)}` : ''
            }`;
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `browse_${res.status}`);
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
      setBrowseError(e instanceof Error ? e.message : 'browse_failed');
    } finally {
      setBrowseLoading(false);
    }
  }

  useEffect(() => {
    if (
      (provider === 'google_drive' && driveReady) ||
      (provider === 'dropbox' && dropboxReady)
    ) {
      setStack([]);
      loadFolder(undefined);
    } else {
      setItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  async function importDriveOrDropbox(item: BrowserItem) {
    setImportingId(item.id);
    setImportError(null);
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
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `import_${res.status}`);
      onImported(j as ImportedSource);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'import_failed');
    } finally {
      setImportingId(null);
    }
  }

  async function importICloud() {
    if (!shareUrl.trim()) return;
    setImportingId('icloud');
    setImportError(null);
    try {
      const res = await fetch('/api/vault/icloud/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareUrl: shareUrl.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `import_${res.status}`);
      onImported(j as ImportedSource);
      setShareUrl('');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'import_failed');
    } finally {
      setImportingId(null);
    }
  }

  async function importGenericUrl() {
    if (!genericUrl.trim()) return;
    setImportingId('url');
    setImportError(null);
    try {
      const res = await fetch('/api/vault/url/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: genericUrl.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `import_${res.status}`);
      onImported(j as ImportedSource);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'import_failed');
    } finally {
      setImportingId(null);
    }
  }

  const driveReady = providers.google_drive;
  const dropboxReady = providers.dropbox;
  const driveConfigured = providers.google_drive_configured;
  const dropboxConfigured = providers.dropbox_configured;
  const browsing = provider === 'google_drive' || provider === 'dropbox';
  const showBrowserNotConnected =
    (provider === 'google_drive' && !driveReady) ||
    (provider === 'dropbox' && !dropboxReady);
  const browserConfigured =
    provider === 'google_drive'
      ? driveConfigured
      : provider === 'dropbox'
      ? dropboxConfigured
      : true;

  return (
    <div
      className={`rounded-lg p-4 ${className ?? ''}`}
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs uppercase tracking-wider text-a7-text/40 font-mono">
          Import from cloud
        </div>
        <a
          href="/dashboard/channels"
          className="text-[11px] text-a7-text/40 hover:text-a7-text"
        >
          Manage connections →
        </a>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <ProviderTab
          active={provider === 'google_drive'}
          icon={<GoogleDriveIcon size={14} />}
          label="Google Drive"
          onClick={() => setProvider('google_drive')}
        />
        <ProviderTab
          active={provider === 'dropbox'}
          icon={<DropboxIcon size={14} />}
          label="Dropbox"
          onClick={() => setProvider('dropbox')}
        />
        <ProviderTab
          active={provider === 'icloud'}
          icon={<ICloudIcon size={14} />}
          label="iCloud"
          onClick={() => setProvider('icloud')}
        />
        <ProviderTab
          active={provider === 'url'}
          icon={<span className="text-[10px] font-mono">URL</span>}
          label="Direct link"
          onClick={() => setProvider('url')}
        />
      </div>

      {loadingProviders && (
        <div className="text-[11px] text-a7-text/40 mb-3">
          Checking connections…
        </div>
      )}

      {importError && (
        <div
          className="mb-3 px-3 py-2 rounded text-xs"
          style={{
            background: 'rgba(232,176,106,0.08)',
            border: '1px solid rgba(232,176,106,0.25)',
            color: '#E8B06A',
          }}
        >
          {importError}
        </div>
      )}

      {browsing && showBrowserNotConnected && (
        <NotConnectedHint
          provider={provider}
          configured={browserConfigured}
          onConnect={() => {
            const slug = provider === 'google_drive' ? 'google-drive' : 'dropbox';
            const next = new URL(window.location.href);
            next.pathname = '/editor';
            next.searchParams.set('step', 'footage');
            window.location.href = `/api/auth/${slug}/connect?next=${encodeURIComponent(
              `${next.pathname}${next.search}${next.hash}`
            )}`;
          }}
        />
      )}

      {browsing && !showBrowserNotConnected && (
        <FileBrowser
          items={items}
          loading={browseLoading}
          error={browseError}
          canBack={stack.length > 0}
          importingId={importingId}
          onBack={() => {
            const next = stack.slice(0, -1);
            setStack(next);
            loadFolder(next[next.length - 1]);
          }}
          onOpen={(item) => {
            setStack((s) => [...s, item.providerRef]);
            loadFolder(item.providerRef);
          }}
          onImport={importDriveOrDropbox}
        />
      )}

      {provider === 'icloud' && (
        <div>
          <p className="text-[11px] text-a7-text/50 mb-3">
            Apple doesn&rsquo;t expose a public iCloud Drive API. Share the file
            from Files.app or icloud.com (&ldquo;Anyone with the link&rdquo;)
            and paste the link below — we&rsquo;ll pull it directly into your
            vault.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={shareUrl}
              onChange={(e) => setShareUrl(e.target.value)}
              placeholder="https://www.icloud.com/iclouddrive/…"
              className="flex-1 px-3 py-2 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/30 focus:outline-none focus:border-grad-teal"
            />
            <button
              onClick={importICloud}
              disabled={!shareUrl.trim() || importingId === 'icloud'}
              className="px-4 py-2 rounded-md text-sm font-medium text-a7-void disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: shareUrl.trim() ? '0 0 12px rgba(45,212,191,0.2)' : 'none',
              }}
            >
              {importingId === 'icloud' ? 'Pulling…' : 'Pull'}
            </button>
          </div>
        </div>
      )}

      {provider === 'url' && (
        <div>
          <p className="text-[11px] text-a7-text/50 mb-3">
            Any direct HTTPS link to a video (MP4/MOV/WebM). Works with signed
            S3/R2/CDN URLs, &ldquo;Anyone with the link&rdquo; cloud shares
            that hand back a real file, etc.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={genericUrl}
              onChange={(e) => setGenericUrl(e.target.value)}
              placeholder="https://…/clip.mp4"
              className="flex-1 px-3 py-2 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/30 focus:outline-none focus:border-grad-teal"
            />
            <button
              onClick={importGenericUrl}
              disabled={!genericUrl.trim() || importingId === 'url'}
              className="px-4 py-2 rounded-md text-sm font-medium text-a7-void disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: genericUrl.trim() ? '0 0 12px rgba(45,212,191,0.2)' : 'none',
              }}
            >
              {importingId === 'url' ? 'Pulling…' : 'Pull'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md transition-all ${
        active ? 'font-semibold' : 'text-a7-text/50'
      }`}
      style={
        active
          ? {
              background:
                'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(45,212,191,0.04))',
              border: '1px solid rgba(45,212,191,0.25)',
              color: '#5BE8D5',
            }
          : { border: '1px solid rgba(245,240,232,0.06)' }
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NotConnectedHint({
  provider,
  configured,
  onConnect,
}: {
  provider: CloudProviderId;
  configured: boolean;
  onConnect: () => void;
}) {
  const name = provider === 'google_drive' ? 'Google Drive' : 'Dropbox';
  return (
    <div
      className="rounded-md p-4 text-center text-xs"
      style={{
        background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))',
        border: '1px solid rgba(45,212,191,0.12)',
        color: 'rgba(245,240,232,0.6)',
      }}
    >
      <p className="mb-3">
        {configured
          ? `Connect ${name} to browse and pull videos directly into your vault.`
          : `${name} OAuth is not configured on this A7 environment yet. Use direct upload, iCloud share link, or direct media URL for now.`}
      </p>
      <button
        onClick={onConnect}
        disabled={!configured}
        className="px-3 py-1.5 rounded-md text-xs font-medium text-a7-void"
        style={{
          background: configured
            ? 'linear-gradient(135deg, #1a9e8f, #2DD4BF)'
            : 'rgba(245,240,232,0.08)',
          color: configured ? '#0A0A0A' : 'rgba(245,240,232,0.45)',
        }}
      >
        {configured ? `Connect ${name}` : 'Provider setup needed'}
      </button>
    </div>
  );
}

function FileBrowser({
  items,
  loading,
  error,
  canBack,
  importingId,
  onBack,
  onOpen,
  onImport,
}: {
  items: BrowserItem[];
  loading: boolean;
  error: string | null;
  canBack: boolean;
  importingId: string | null;
  onBack: () => void;
  onOpen: (item: BrowserItem) => void;
  onImport: (item: BrowserItem) => void;
}) {
  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        background: '#0C0C0A',
        border: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-a7-text/[0.04]">
        <button
          disabled={!canBack}
          onClick={onBack}
          className="text-[11px] text-a7-text/50 hover:text-a7-text disabled:opacity-30"
        >
          ← Back
        </button>
        <span className="text-[11px] text-a7-text/40">
          {loading ? 'Loading…' : `${items.length} items`}
        </span>
      </div>
      {error && (
        <div className="px-3 py-2 text-xs" style={{ color: '#E8B06A' }}>
          {error}
        </div>
      )}
      {items.length === 0 && !loading && !error ? (
        <div className="px-3 py-8 text-center text-xs text-a7-text/30">
          This folder has no videos.
        </div>
      ) : (
        <ul className="max-h-72 overflow-auto divide-y divide-a7-text/[0.04]">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span
                className="text-[10px] font-mono uppercase tracking-wide"
                style={{
                  color: item.kind === 'folder' ? '#D4944A' : '#5BE8D5',
                }}
              >
                {item.kind === 'folder' ? 'DIR' : 'VID'}
              </span>
              <span className="flex-1 truncate text-xs text-a7-text/80">
                {item.name}
              </span>
              <span className="text-[10px] text-a7-text/30 w-16 text-right">
                {formatBytes(item.size)}
              </span>
              {item.kind === 'folder' ? (
                <button
                  onClick={() => onOpen(item)}
                  className="text-[11px] px-2 py-1 rounded border border-a7-text/[0.08] text-a7-text/60 hover:text-a7-text"
                >
                  Open
                </button>
              ) : (
                <button
                  disabled={importingId === item.id}
                  onClick={() => onImport(item)}
                  className="text-[11px] px-2 py-1 rounded font-medium disabled:opacity-40"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.05))',
                    border: '1px solid rgba(45,212,191,0.3)',
                    color: '#5BE8D5',
                  }}
                >
                  {importingId === item.id ? 'Pulling…' : 'Pull'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
