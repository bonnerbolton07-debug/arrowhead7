'use client';

// =============================================================================
// Arrowhead 7 — Vault Manager
// =============================================================================
// The post-onboarding home for managing vault content: folder tabs, upload,
// import from connected sources, share/download/delete per file.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudIcon,
  DropboxIcon,
  GoogleDriveIcon,
  ICloudIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
  VaultIcon,
  CheckIcon,
} from '@/components/ui/icons';
import type { VaultFile, VaultFolder } from '@/lib/vault';
import type { SubscriptionTier } from '@/types';
import { VaultBrowser } from './VaultBrowser';

const FOLDERS: { id: VaultFolder; label: string; desc: string }[] = [
  { id: 'references', label: 'References', desc: 'Mood boards, style refs, brand assets.' },
  { id: 'footage', label: 'Footage', desc: 'Raw clips and source material.' },
  { id: 'exports', label: 'Exports', desc: 'Finished renders ready to share.' },
];

const PROVIDER_META: Record<
  string,
  { name: string; Icon: typeof GoogleDriveIcon; oauthSlug?: string; shareLink?: boolean }
> = {
  google_drive: {
    name: 'Google Drive',
    Icon: GoogleDriveIcon,
    oauthSlug: 'google-drive',
  },
  dropbox: { name: 'Dropbox', Icon: DropboxIcon, oauthSlug: 'dropbox' },
  icloud: { name: 'iCloud Drive', Icon: ICloudIcon, shareLink: true },
};

const DEFAULT_PROVIDER_SETUP: Record<string, boolean> = {
  google_drive: false,
  dropbox: false,
  icloud: true,
};

const ALLOWED = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
]);

function formatBytes(n: number): string {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  initialFiles: VaultFile[];
  initialStorageBytes: number;
  initialFileCount: number;
  quotaBytes: number; // -1 = unlimited
  tier: SubscriptionTier;
  connections: { provider: string; account: string }[];
}

export function VaultManager({
  initialFiles,
  initialStorageBytes,
  initialFileCount,
  quotaBytes,
  tier,
  connections,
}: Props) {
  const [files, setFiles] = useState<VaultFile[]>(initialFiles);
  const [storageBytes, setStorageBytes] = useState(initialStorageBytes);
  const [fileCount, setFileCount] = useState(initialFileCount);
  const [folder, setFolder] = useState<VaultFolder>('references');
  const [showImport, setShowImport] = useState(() => connections.length > 0);
  const [uploadingItems, setUploadingItems] = useState<
    { id: string; name: string; progress: number; folder: VaultFolder; error?: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [icloudUrl, setIcloudUrl] = useState('');
  const [icloudBusy, setIcloudBusy] = useState(false);
  const [icloudError, setIcloudError] = useState<string | null>(null);
  const [providerSetup, setProviderSetup] = useState(DEFAULT_PROVIDER_SETUP);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/vault/connections', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setProviderSetup({
          google_drive: !!data.setup?.google_drive_configured,
          dropbox: !!data.setup?.dropbox_configured,
          icloud: true,
        });
        if (data.connections?.length > 0) setShowImport(true);
      } catch {
        // keep conservative defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/files', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        files: VaultFile[];
        stats: { totalBytes: number; fileCount: number };
      };
      setFiles(data.files);
      setStorageBytes(data.stats.totalBytes);
      setFileCount(data.stats.fileCount);
    } catch {
      // ignore
    }
  }, []);

  const visibleFiles = useMemo(
    () => files.filter((f) => f.folder === folder),
    [files, folder]
  );

  const counts = useMemo(() => {
    const map: Record<VaultFolder, number> = {
      references: 0,
      footage: 0,
      exports: 0,
    };
    for (const f of files) map[f.folder]++;
    return map;
  }, [files]);

  const uploadFile = useCallback(
    async (file: File, targetFolder: VaultFolder) => {
      if (!ALLOWED.has(file.type)) return;
      if (quotaBytes !== -1 && storageBytes + file.size > quotaBytes) {
        const localId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setUploadingItems((p) => [
          ...p,
          {
            id: localId,
            name: file.name,
            progress: 0,
            folder: targetFolder,
            error: 'Vault storage limit reached. Delete files or upgrade before uploading more media.',
          },
        ]);
        return;
      }
      const localId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploadingItems((p) => [
        ...p,
        { id: localId, name: file.name, progress: 0, folder: targetFolder },
      ]);
      const patch = (q: Partial<{ progress: number; error: string }>) =>
        setUploadingItems((p) => p.map((u) => (u.id === localId ? { ...u, ...q } : u)));

      try {
        const presignRes = await fetch('/api/vault/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            folder: targetFolder,
            sizeBytes: file.size,
          }),
        });
        if (!presignRes.ok) {
          const j = await presignRes.json().catch(() => ({}));
          throw new Error(j.error || `Presign failed (${presignRes.status})`);
        }
        const { uploadUrl, key } = await presignRes.json();

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              patch({ progress: Math.round((e.loaded / e.total) * 100) });
            }
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed: ${xhr.status}`));
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(file);
        });

        await fetch('/api/vault/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            r2Key: key,
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            folder: targetFolder,
            source: 'upload',
          }),
        });
        await refresh();
        setUploadingItems((p) => p.filter((u) => u.id !== localId));
      } catch (err) {
        patch({ error: err instanceof Error ? err.message : 'Upload failed' });
      }
    },
    [quotaBytes, refresh, storageBytes]
  );

  const handleFiles = useCallback(
    (selected: File[]) => {
      for (const f of selected) void uploadFile(f, folder);
    },
    [folder, uploadFile]
  );

  const importIcloud = useCallback(async () => {
    const url = icloudUrl.trim();
    if (!url) return;
    setIcloudBusy(true);
    setIcloudError(null);
    try {
      const res = await fetch('/api/vault/icloud/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareUrl: url }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Import failed (${res.status})`);
      }
      setIcloudUrl('');
      await refresh();
    } catch (err) {
      setIcloudError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIcloudBusy(false);
    }
  }, [icloudUrl, refresh]);

  const removeFile = useCallback(
    async (id: string) => {
      if (!confirm('Remove this file from your vault? This cannot be undone.')) {
        return;
      }
      try {
        const res = await fetch(`/api/vault/files/${id}`, { method: 'DELETE' });
        if (res.ok) await refresh();
      } catch {
        // ignore
      }
    },
    [refresh]
  );

  const usagePct =
    quotaBytes === -1 ? 0 : Math.min((storageBytes / quotaBytes) * 100, 100);

  return (
    <div className="space-y-8">
      {/* Storage card */}
      <div
        className="relative overflow-hidden rounded-lg p-6"
        style={{
          background:
            'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(184,115,51,0.04))',
          border: '1px solid rgba(245,240,232,0.06)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, rgba(45,212,191,0.3), rgba(184,115,51,0.2), transparent)',
          }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-a7-text/40 font-mono mb-2">
              Vault usage · {fileCount} {fileCount === 1 ? 'file' : 'files'}
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-a7-text">
                {formatBytes(storageBytes)}
              </span>
              <span className="text-sm text-a7-text/40">
                of {quotaBytes === -1 ? 'unlimited' : formatBytes(quotaBytes)}
              </span>
            </div>
            <div
              className="w-full rounded-full h-2 overflow-hidden"
              style={{ background: 'rgba(245,240,232,0.06)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: quotaBytes === -1 ? '20%' : `${usagePct}%`,
                  background:
                    usagePct > 90
                      ? 'linear-gradient(90deg, #B87333, #EF4444)'
                      : 'linear-gradient(90deg, #1a9e8f, #2DD4BF, #5BE8D5)',
                  boxShadow: '0 0 12px rgba(45,212,191,0.3)',
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end shrink-0">
            <button
              onClick={() => inputRef.current?.click()}
              className="px-4 py-2 rounded-md text-sm font-medium text-a7-void"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: '0 0 14px rgba(45,212,191,0.22)',
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <UploadIcon size={14} /> Upload
              </span>
            </button>
            <button
              onClick={() => setShowImport((v) => !v)}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{
                background:
                  'linear-gradient(135deg, rgba(184,115,51,0.12), rgba(184,115,51,0.04))',
                border: '1px solid rgba(184,115,51,0.25)',
                color: '#E8B06A',
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <CloudIcon size={14} gradient="copper" />
                {showImport ? 'Hide import' : 'Import from cloud'}
              </span>
            </button>
            {tier === 'free' && (
              <a
                href="/pricing"
                className="px-3 py-2 rounded-md text-xs text-a7-text/60"
                style={{ border: '1px solid rgba(245,240,232,0.08)' }}
              >
                Get more storage
              </a>
            )}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          if (list.length) handleFiles(list);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />

      {/* Connect sources strip */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-a7-text">Sources</h2>
            <p className="text-xs text-a7-text/40 mt-1">
              Connect storage so you can pull files straight into your vault.
            </p>
          </div>
          <div className="text-xs text-a7-text/40">
            {connections.length} connected
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(PROVIDER_META).map(([id, meta]) => {
            const conn = connections.find((c) => c.provider === id);
            const connected = !!conn;
            const configured = providerSetup[id] ?? false;
            const href = meta.oauthSlug
              ? configured
                ? `/api/auth/${meta.oauthSlug}/connect?next=/vault`
                : undefined
              : undefined;
            const subtitle = connected
              ? conn?.account
              : meta.shareLink
              ? 'Paste an iCloud share link below'
              : configured
              ? 'Not connected'
              : 'Provider setup needed';
            return (
              <div
                key={id}
                onClick={() => {
                  if (connected && !meta.shareLink) setShowImport(true);
                }}
                className="rounded-lg p-4 flex items-center gap-3"
                style={{
                  background: connected
                    ? 'linear-gradient(135deg, rgba(45,212,191,0.05), rgba(45,212,191,0.01))'
                    : 'linear-gradient(180deg, #10100E, #0C0C0A)',
                  border: connected
                    ? '1px solid rgba(45,212,191,0.18)'
                    : '1px solid rgba(245,240,232,0.05)',
                }}
              >
                <meta.Icon size={26} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-a7-text">{meta.name}</div>
                  <div className="text-xs text-a7-text/40 truncate">{subtitle}</div>
                </div>
                {connected ? (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{
                      background: 'rgba(45,212,191,0.08)',
                      color: '#2DD4BF',
                      border: '1px solid rgba(45,212,191,0.2)',
                    }}
                  >
                    <CheckIcon size={10} /> on
                  </span>
                ) : href ? (
                  <a
                    href={href}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-a7-void"
                    style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }}
                  >
                    Connect
                  </a>
                ) : meta.shareLink ? (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ border: '1px solid rgba(245,240,232,0.08)', color: 'rgba(245,240,232,0.5)' }}
                  >
                    Share link
                  </span>
                ) : !configured ? (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ border: '1px solid rgba(212,148,74,0.2)', color: '#D4944A' }}
                  >
                    Setup needed
                  </span>
                ) : (
                  <span className="text-xs text-a7-text/30">—</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <details
            className="rounded-lg overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.06)',
            }}
          >
            <summary className="px-4 py-3 text-xs text-a7-text/60 cursor-pointer">
              Paste an iCloud Drive share link
            </summary>
            <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={icloudUrl}
                  onChange={(e) => setIcloudUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void importIcloud();
                    }
                  }}
                  placeholder="https://www.icloud.com/iclouddrive/…"
                  className="flex-1 px-3 py-2 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/20 focus:outline-none focus:border-grad-teal"
                />
                <button
                  onClick={() => void importIcloud()}
                  disabled={!icloudUrl.trim() || icloudBusy}
                  className="px-4 py-2 rounded-md text-xs font-medium text-a7-void disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }}
                >
                  {icloudBusy ? 'Importing…' : 'Import'}
                </button>
              </div>
              {icloudError && (
                <p className="text-xs" style={{ color: '#E8B06A' }}>
                  {icloudError}
                </p>
              )}
              <p className="text-[11px] text-a7-text/30">
                From the iCloud Files app, share a file and copy the link. The bytes stream straight into your vault.
              </p>
            </div>
          </details>
        </div>
        {showImport && connections.length > 0 && (
          <div className="mt-4">
            <VaultBrowser
              connected={connections.reduce(
                (acc, c) => {
                  acc[c.provider as 'google_drive' | 'dropbox'] = { account: c.account };
                  return acc;
                },
                {} as Record<'google_drive' | 'dropbox', { account: string }>
              )}
            />
          </div>
        )}
        {showImport && connections.length === 0 && (
          <div
            className="mt-4 rounded-lg p-6 text-center"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.04)',
            }}
          >
            <p className="text-sm text-a7-text/50">
              Connect a source above to browse and import.
            </p>
          </div>
        )}
      </section>

      {/* Folder tabs + listing */}
      <section>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const list = Array.from(e.dataTransfer.files || []);
            if (list.length) handleFiles(list);
          }}
        >
          <div className="flex flex-wrap gap-2 mb-4">
            {FOLDERS.map((f) => {
              const active = f.id === folder;
              return (
                <button
                  key={f.id}
                  onClick={() => setFolder(f.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    active ? 'text-grad-teal' : 'text-a7-text/50 hover:text-a7-text'
                  }`}
                  style={
                    active
                      ? {
                          background:
                            'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(45,212,191,0.04))',
                          border: '1px solid rgba(45,212,191,0.25)',
                        }
                      : {
                          background: 'transparent',
                          border: '1px solid rgba(245,240,232,0.06)',
                        }
                  }
                >
                  /{f.label}
                  <span className="ml-2 text-[10px] font-mono opacity-60">
                    {counts[f.id]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-a7-text/40 mb-4">
            {FOLDERS.find((f) => f.id === folder)?.desc}
          </p>

          {uploadingItems.filter((u) => u.folder === folder).length > 0 && (
            <ul className="mb-4 space-y-2">
              {uploadingItems
                .filter((u) => u.folder === folder)
                .map((u) => (
                  <li
                    key={u.id}
                    className="rounded-md px-4 py-3 flex items-center gap-3"
                    style={{
                      background: 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(45,212,191,0.01))',
                      border: '1px solid rgba(45,212,191,0.15)',
                    }}
                  >
                    <span className="text-[10px] font-mono uppercase tracking-wider text-grad-teal w-12">
                      …
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-a7-text truncate">{u.name}</div>
                      <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(245,240,232,0.06)' }}>
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${Math.max(u.progress, 4)}%`,
                            background: u.error
                              ? 'linear-gradient(135deg, #E8B06A, #B87333)'
                              : 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-a7-text/40 w-12 text-right">
                      {u.error ? 'err' : `${u.progress}%`}
                    </span>
                  </li>
                ))}
            </ul>
          )}

          {visibleFiles.length === 0 ? (
            <EmptyFolder folder={folder} onUpload={() => inputRef.current?.click()} />
          ) : (
            <ul
              className="rounded-lg overflow-hidden divide-y divide-a7-text/[0.04]"
              style={{
                background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: '1px solid rgba(245,240,232,0.04)',
              }}
            >
              {visibleFiles.map((f) => (
                <VaultFileRow key={f.id} file={f} onRemove={removeFile} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function VaultFileRow({
  file,
  onRemove,
}: {
  file: VaultFile;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState<null | 'download' | 'share'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadOrOpen = async (mode: 'download' | 'share') => {
    setBusy(mode);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/vault/files/${file.id}`);
      if (!res.ok) {
        setError('Could not prepare this file. Try again.');
        return;
      }
      const data = (await res.json()) as { downloadUrl?: string };
      if (!data.downloadUrl) {
        setError('No download link is available yet.');
        return;
      }
      if (mode === 'share') {
        try {
          await navigator.clipboard.writeText(data.downloadUrl);
          setMessage('Share link copied. It expires in 1 hour.');
        } catch {
          setError('Could not copy automatically. Open the file and copy the browser link.');
        }
      } else {
        window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <span
        className="text-[10px] font-mono uppercase tracking-wider w-12"
        style={{
          color:
            file.kind === 'image'
              ? '#D4944A'
              : file.kind === 'video'
              ? '#5BE8D5'
              : '#E8B06A',
        }}
      >
        {file.kind === 'image' ? 'IMG' : file.kind === 'video' ? 'VID' : file.kind === 'audio' ? 'AUD' : 'FILE'}
      </span>
      {(message || error) && (
        <span
          className="text-[11px] hidden sm:inline"
          style={{ color: error ? '#E8B06A' : '#5BE8D5' }}
        >
          {error || message}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-a7-text/90 truncate">{file.filename}</div>
        <div className="text-[11px] text-a7-text/30 flex gap-3 mt-0.5">
          <span>{formatBytes(file.size_bytes)}</span>
          <span>via {file.source.replace('_', ' ')}</span>
          <span>{relativeTime(file.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => downloadOrOpen('download')}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-md text-xs text-a7-text/70 hover:text-a7-text"
          style={{ border: '1px solid rgba(245,240,232,0.06)' }}
        >
          {busy === 'download' ? '…' : 'Download'}
        </button>
        <button
          onClick={() => downloadOrOpen('share')}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-md text-xs text-grad-teal"
          style={{
            background: 'rgba(45,212,191,0.06)',
            border: '1px solid rgba(45,212,191,0.18)',
          }}
        >
          {busy === 'share' ? '…' : 'Share'}
        </button>
        <button
          onClick={() => onRemove(file.id)}
          title="Remove"
          className="w-7 h-7 rounded flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(232,176,106,0.05), rgba(232,176,106,0.01))',
            border: '1px solid rgba(232,176,106,0.2)',
            color: '#E8B06A',
          }}
        >
          <TrashIcon size={12} gradient="copper" />
        </button>
      </div>
    </li>
  );
}

function EmptyFolder({
  folder,
  onUpload,
}: {
  folder: VaultFolder;
  onUpload: () => void;
}) {
  return (
    <div
      className="rounded-lg p-12 text-center"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px dashed rgba(245,240,232,0.08)',
      }}
    >
      <VaultIcon size={28} gradient="copper" className="mx-auto mb-3 opacity-60" />
      <p className="text-sm text-a7-text/50 mb-2">
        {folder === 'exports'
          ? 'No exports yet — finished renders land here automatically.'
          : `No files in /${folder} yet.`}
      </p>
      {folder !== 'exports' && (
        <button
          onClick={onUpload}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-a7-void"
          style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }}
        >
          <PlusIcon size={14} /> Upload here
        </button>
      )}
    </div>
  );
}
