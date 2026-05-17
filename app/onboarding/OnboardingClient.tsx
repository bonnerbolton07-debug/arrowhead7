'use client';

// =============================================================================
// Arrowhead 7 — Onboarding Client
// =============================================================================
// Four sequential steps:
//   1. Create Your Vault — pick a vault name, see the folder layout
//   2. Connect Your Sources — link cloud accounts (or skip / device only)
//   3. Import Your Content — pull from connected sources or upload from device
//   4. Start Creating — recap and bounce to the editor
//
// The step pointer is persisted in `profiles.onboarding_step` so a refresh
// brings the user back to the right spot.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo, LogoIcon } from '@/components/ui/Logo';
import {
  GoogleDriveIcon,
  DropboxIcon,
  ICloudIcon,
  VaultIcon,
  UploadIcon,
  CheckIcon,
  ArrowRightIcon,
  FilmIcon,
  CloudIcon,
} from '@/components/ui/icons';

type Step = 'vault' | 'sources' | 'import' | 'studio';

const STEPS: { id: Step; label: string; sub: string }[] = [
  { id: 'vault', label: 'Create Vault', sub: 'Name your workspace' },
  { id: 'sources', label: 'Connect Sources', sub: 'Link your storage' },
  { id: 'import', label: 'Import Content', sub: 'Stage your media' },
  { id: 'studio', label: 'Start Creating', sub: 'Open the studio' },
];

interface InitialState {
  step: Step | 'done';
  completedAt: string | null;
  vaultName: string;
  storageBytes: number;
  fileCount: number;
  connections: { provider: string; account: string }[];
  email: string;
}

interface VaultFile {
  id: string;
  folder: 'references' | 'footage' | 'exports';
  filename: string;
  size_bytes: number;
  kind: 'video' | 'image' | 'audio' | 'other';
  source: string;
  created_at: string;
}

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
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function OnboardingClient({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    initial.step === 'done' ? 'studio' : initial.step
  );
  const [vaultName, setVaultName] = useState(
    initial.vaultName || defaultVaultName(initial.email)
  );
  const [savingStep, setSavingStep] = useState(false);
  const [connections, setConnections] = useState(initial.connections);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [storageBytes, setStorageBytes] = useState(initial.storageBytes);
  const [fileCount, setFileCount] = useState(initial.fileCount);

  const persistStep = useCallback(
    async (next: Step | 'done', extras?: { vaultName?: string; complete?: boolean }) => {
      setSavingStep(true);
      try {
        await fetch('/api/vault/onboarding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: extras?.complete ? 'done' : next,
            vaultName: extras?.vaultName,
            complete: extras?.complete,
          }),
        });
      } catch {
        // Non-fatal — local navigation still works.
      } finally {
        setSavingStep(false);
      }
    },
    []
  );

  const refreshVault = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/files', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        files: VaultFile[];
        stats: { totalBytes: number; fileCount: number };
      };
      setVaultFiles(data.files);
      setStorageBytes(data.stats.totalBytes);
      setFileCount(data.stats.fileCount);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (step === 'import' || step === 'studio') {
      void refreshVault();
    }
  }, [step, refreshVault]);

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  const goNext = async () => {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) {
      const next = STEPS[idx + 1].id;
      setStep(next);
      void persistStep(next);
    }
  };
  const goBack = () => {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  };

  const finish = async () => {
    await persistStep('done', { complete: true });
    router.push('/editor');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void flex flex-col">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(45,212,191,0.05) 0%, transparent 55%)',
        }}
      />

      <header className="relative flex items-center justify-between px-6 py-4 border-b border-a7-text/[0.04]">
        <a
          href="/dashboard"
          className="flex items-center gap-3 text-a7-text/40 hover:text-a7-text text-sm transition-colors"
        >
          <LogoIcon size={24} variant="dual" />
          <span className="font-medium text-a7-text">Arrowhead 7</span>
        </a>
        <div className="text-[10px] uppercase tracking-wider text-a7-text/30 font-mono">
          Onboarding · {stepIdx + 1} of {STEPS.length}
        </div>
        <div className="text-xs text-a7-text/40">{initial.email}</div>
      </header>

      <StepRail step={step} />

      <main className="flex-1 px-6 py-10 sm:py-14 relative z-10">
        <div className="max-w-2xl mx-auto">
          {step === 'vault' && (
            <VaultStep
              vaultName={vaultName}
              setVaultName={setVaultName}
              storageBytes={storageBytes}
              fileCount={fileCount}
              onNext={async () => {
                await persistStep('sources', { vaultName });
                setStep('sources');
              }}
              saving={savingStep}
            />
          )}
          {step === 'sources' && (
            <SourcesStep
              connections={connections}
              onConnectionsChange={setConnections}
              onNext={async () => {
                await persistStep('import');
                setStep('import');
              }}
              onBack={goBack}
            />
          )}
          {step === 'import' && (
            <ImportStep
              connections={connections}
              files={vaultFiles}
              storageBytes={storageBytes}
              fileCount={fileCount}
              onRefresh={refreshVault}
              onNext={async () => {
                await persistStep('studio');
                setStep('studio');
              }}
              onBack={goBack}
            />
          )}
          {step === 'studio' && (
            <StudioStep
              vaultName={vaultName}
              fileCount={fileCount}
              storageBytes={storageBytes}
              files={vaultFiles}
              onFinish={finish}
              onBack={goBack}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function defaultVaultName(email: string): string {
  const local = email.split('@')[0] || 'creator';
  const tidy = local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${tidy}'s Vault`;
}

// ─── Rail ────────────────────────────────────────────────────────────────────

function StepRail({ step }: { step: Step }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="relative border-b border-a7-text/[0.04]">
      <div className="max-w-3xl mx-auto px-6 py-5">
        <div className="flex items-center gap-2 sm:gap-4">
          {STEPS.map((s, i) => {
            const active = i === idx;
            const done = i < idx;
            return (
              <div key={s.id} className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-mono"
                  style={
                    active
                      ? {
                          background:
                            'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                          color: '#0A0A0A',
                          boxShadow: '0 0 12px rgba(45,212,191,0.4)',
                        }
                      : done
                      ? {
                          background:
                            'linear-gradient(135deg, rgba(45,212,191,0.18), rgba(45,212,191,0.06))',
                          border: '1px solid rgba(45,212,191,0.3)',
                          color: '#5BE8D5',
                        }
                      : {
                          background: 'rgba(245,240,232,0.04)',
                          border: '1px solid rgba(245,240,232,0.08)',
                          color: 'rgba(245,240,232,0.4)',
                        }
                  }
                >
                  {done ? <CheckIcon size={12} /> : i + 1}
                </div>
                <div className="min-w-0 hidden sm:block">
                  <div
                    className={`text-xs font-medium truncate ${
                      active ? 'text-a7-text' : done ? 'text-grad-teal' : 'text-a7-text/40'
                    }`}
                  >
                    {s.label}
                  </div>
                  <div className="text-[10px] text-a7-text/30 truncate">{s.sub}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="flex-1 h-px"
                    style={{
                      background: done
                        ? 'linear-gradient(90deg, rgba(45,212,191,0.4), rgba(45,212,191,0.1))'
                        : 'rgba(245,240,232,0.06)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Vault ───────────────────────────────────────────────────────────

function VaultStep({
  vaultName,
  setVaultName,
  storageBytes,
  fileCount,
  onNext,
  saving,
}: {
  vaultName: string;
  setVaultName: (v: string) => void;
  storageBytes: number;
  fileCount: number;
  onNext: () => Promise<void> | void;
  saving: boolean;
}) {
  return (
    <div>
      <Heading
        eyebrow="Step 1 of 4"
        title="Create your vault"
        subtitle="The vault is your home base. Every reference, raw clip, and finished export gets sorted into the three folders below — and your editor pulls from them when you sit down to build."
      />

      <div
        className="rounded-xl p-6 mb-6"
        style={{
          background: 'linear-gradient(180deg, rgba(16,16,14,0.92), rgba(10,10,10,0.92))',
          border: '1px solid rgba(245,240,232,0.06)',
        }}
      >
        <div className="text-[10px] uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
          Vault name
        </div>
        <input
          value={vaultName}
          onChange={(e) => setVaultName(e.target.value.slice(0, 80))}
          placeholder="My Vault"
          className="w-full px-4 py-3 rounded-md text-base text-a7-text bg-a7-base border border-a7-text/[0.08] focus:outline-none focus:border-grad-teal"
        />
        <p className="text-xs text-a7-text/30 mt-2">
          You can rename this later in Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <FolderCard
          name="references"
          desc="Mood boards, style refs, brand assets."
          accent="teal"
        />
        <FolderCard
          name="footage"
          desc="Raw clips and source material."
          accent="dual"
        />
        <FolderCard
          name="exports"
          desc="Finished renders ready to share."
          accent="copper"
        />
      </div>

      {(storageBytes > 0 || fileCount > 0) && (
        <div
          className="rounded-md p-3 mb-6 text-xs text-a7-text/50 flex items-center gap-2"
          style={{ border: '1px solid rgba(45,212,191,0.18)' }}
        >
          <VaultIcon size={14} gradient="teal" />
          You already have {fileCount} {fileCount === 1 ? 'file' : 'files'}{' '}
          ({formatBytes(storageBytes)}) staged from a previous session — they're waiting in your vault.
        </div>
      )}

      <NavRow
        backHref="/dashboard"
        backLabel="Save & exit"
        nextLabel="Continue"
        nextDisabled={!vaultName.trim() || saving}
        onNext={onNext}
      />
    </div>
  );
}

function FolderCard({
  name,
  desc,
  accent,
}: {
  name: string;
  desc: string;
  accent: 'teal' | 'copper' | 'dual';
}) {
  const bg =
    accent === 'teal'
      ? 'linear-gradient(135deg, rgba(45,212,191,0.07), rgba(45,212,191,0.02))'
      : accent === 'copper'
      ? 'linear-gradient(135deg, rgba(184,115,51,0.07), rgba(184,115,51,0.02))'
      : 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(184,115,51,0.03))';
  const border =
    accent === 'teal'
      ? 'rgba(45,212,191,0.18)'
      : accent === 'copper'
      ? 'rgba(184,115,51,0.18)'
      : 'rgba(245,240,232,0.08)';
  return (
    <div
      className="rounded-lg p-4 relative overflow-hidden"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="text-[10px] uppercase tracking-wider font-mono mb-2 text-a7-text/40">
        Folder
      </div>
      <div className="font-semibold text-sm text-a7-text mb-1">/{name}</div>
      <div className="text-xs text-a7-text/50">{desc}</div>
    </div>
  );
}

// ─── Step 2: Sources ─────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    desc: 'Pull from My Drive or shared folders.',
    Icon: GoogleDriveIcon,
    oauthSlug: 'google-drive',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    desc: 'Sync your camera roll and team drives.',
    Icon: DropboxIcon,
    oauthSlug: 'dropbox',
  },
  {
    id: 'icloud',
    name: 'iCloud Drive',
    desc: 'Use public share links from Files.app or icloud.com.',
    Icon: ICloudIcon,
    oauthSlug: undefined,
  },
] as const;

function SourcesStep({
  connections,
  onConnectionsChange,
  onNext,
  onBack,
}: {
  connections: { provider: string; account: string }[];
  onConnectionsChange: (next: { provider: string; account: string }[]) => void;
  onNext: () => Promise<void> | void;
  onBack: () => void;
}) {
  const [providerSetup, setProviderSetup] = useState({
    google_drive: false,
    dropbox: false,
    icloud: true,
  });

  // Re-pull connection state on mount and whenever the tab regains focus —
  // covers the round-trip back from an OAuth provider's consent screen.
  useEffect(() => {
    const handler = async () => {
      try {
        const res = await fetch('/api/vault/connections', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          connections: { provider: string; account: string }[];
          setup?: {
            google_drive_configured?: boolean;
            dropbox_configured?: boolean;
            icloud_share_link?: boolean;
          };
        };
        onConnectionsChange(data.connections);
        setProviderSetup({
          google_drive: !!data.setup?.google_drive_configured,
          dropbox: !!data.setup?.dropbox_configured,
          icloud: true,
        });
      } catch {
        // ignore
      }
    };
    window.addEventListener('focus', handler);
    void handler();
    return () => window.removeEventListener('focus', handler);
  }, [onConnectionsChange]);

  const connectedSet = new Set(connections.map((c) => c.provider));

  return (
    <div>
      <Heading
        eyebrow="Step 2 of 4"
        title="Connect your sources"
        subtitle="Link the storage where your raw clips already live. We only read — never modify — and you can revoke access any time. Skip this step if you'd rather upload directly from your device."
      />

      <div className="space-y-3 mb-6">
        {PROVIDERS.map((p) => {
          const connected = connectedSet.has(p.id);
          const account = connections.find((c) => c.provider === p.id)?.account;
          const configured = providerSetup[p.id] ?? false;
          const href = p.oauthSlug
            ? configured
              ? `/api/auth/${p.oauthSlug}/connect?next=/onboarding`
              : undefined
            : undefined;
          return (
            <div
              key={p.id}
              className="rounded-lg p-4 flex items-center gap-4"
              style={{
                background: connected
                  ? 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(45,212,191,0.02))'
                  : 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: connected
                  ? '1px solid rgba(45,212,191,0.22)'
                  : '1px solid rgba(245,240,232,0.06)',
              }}
            >
              <p.Icon size={28} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-a7-text">{p.name}</div>
                <div className="text-xs text-a7-text/40 truncate">
                  {connected ? account : p.desc}
                </div>
              </div>
              {connected ? (
                <span
                  className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded-full"
                  style={{
                    background: 'rgba(45,212,191,0.1)',
                    color: '#5BE8D5',
                    border: '1px solid rgba(45,212,191,0.25)',
                  }}
                >
                  <CheckIcon size={12} /> connected
                </span>
              ) : href ? (
                <a
                  href={href}
                  className="px-4 py-2 rounded-md text-sm font-medium text-a7-void transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                    boxShadow: '0 0 12px rgba(45,212,191,0.2)',
                  }}
                >
                  Connect
                </a>
              ) : p.id === 'icloud' ? (
                <span
                  className="px-3 py-1.5 rounded-md text-xs text-a7-text/40"
                  style={{ border: '1px solid rgba(245,240,232,0.06)' }}
                >
                  Share link
                </span>
              ) : (
                <span
                  className="px-3 py-1.5 rounded-md text-xs text-a7-text/40"
                  style={{ border: '1px solid rgba(212,148,74,0.18)', color: '#D4944A' }}
                >
                  Setup needed
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="rounded-md p-3 mb-6 text-xs text-a7-text/50 flex items-start gap-2"
        style={{ border: '1px solid rgba(245,240,232,0.06)' }}
      >
        <CloudIcon size={14} gradient="teal" />
        <span>
          Don't see your storage here? You can still upload directly from your device on the next step.
        </span>
      </div>

      <NavRow
        onBack={onBack}
        nextLabel={connectedSet.size === 0 ? 'Skip — upload from device' : 'Continue'}
        onNext={onNext}
      />
    </div>
  );
}

// ─── Step 3: Import ──────────────────────────────────────────────────────────

function ImportStep({
  connections,
  files,
  storageBytes,
  fileCount,
  onRefresh,
  onNext,
  onBack,
}: {
  connections: { provider: string; account: string }[];
  files: VaultFile[];
  storageBytes: number;
  fileCount: number;
  onRefresh: () => Promise<void>;
  onNext: () => Promise<void> | void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingItems, setUploadingItems] = useState<
    { id: string; name: string; progress: number; error?: string }[]
  >([]);
  const [urlInput, setUrlInput] = useState('');
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const updateUploading = (id: string, patch: Partial<{ progress: number; error: string }>) => {
    setUploadingItems((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
    );
  };
  const removeUploading = (id: string) => {
    setUploadingItems((prev) => prev.filter((u) => u.id !== id));
  };

  const handleFiles = useCallback(
    async (selected: File[]) => {
      for (const file of selected) {
        if (!ALLOWED.has(file.type)) continue;
        const localId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setUploadingItems((prev) => [
          ...prev,
          { id: localId, name: file.name, progress: 0 },
        ]);
        try {
          const presignRes = await fetch('/api/vault/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
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
                updateUploading(localId, {
                  progress: Math.round((e.loaded / e.total) * 100),
                });
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
              source: 'upload',
            }),
          });

          await onRefresh();
          removeUploading(localId);
        } catch (err) {
          updateUploading(localId, {
            error: err instanceof Error ? err.message : 'Upload failed',
          });
        }
      }
    },
    [onRefresh]
  );

  const importUrl = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      setUrlError('Enter a valid URL (https://…)');
      return;
    }
    setUrlError(null);
    setUrlImporting(true);
    try {
      const res = await fetch('/api/vault/url/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Import failed (${res.status})`);
      }
      setUrlInput('');
      await onRefresh();
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setUrlImporting(false);
    }
  }, [urlInput, onRefresh]);

  const hasContent = files.length > 0;

  return (
    <div>
      <Heading
        eyebrow="Step 3 of 4"
        title="Import your content"
        subtitle="Upload from your device, or pick files from the cloud storage you just connected. Anything you import here lands in your vault so the editor can pull from it instantly."
      />

      {hasContent && (
        <div
          className="rounded-lg p-4 mb-5 flex items-center gap-3"
          style={{
            background: 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(45,212,191,0.02))',
            border: '1px solid rgba(45,212,191,0.22)',
          }}
        >
          <CheckIcon size={16} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-a7-text">
              {fileCount} {fileCount === 1 ? 'file' : 'files'} in your vault
            </div>
            <div className="text-xs text-a7-text/50">
              {formatBytes(storageBytes)} staged across references / footage / exports
            </div>
          </div>
        </div>
      )}

      <label
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const list = Array.from(e.dataTransfer.files || []);
          if (list.length) void handleFiles(list);
        }}
        className="relative overflow-hidden block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:scale-[1.005]"
        style={{
          borderColor: 'rgba(45,212,191,0.2)',
          background: 'linear-gradient(135deg, rgba(45,212,191,0.03), rgba(45,212,191,0.005))',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = Array.from(e.target.files || []);
            if (list.length) void handleFiles(list);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
        <UploadIcon size={32} gradient="teal" className="mx-auto mb-2" />
        <p className="text-a7-text/60 text-sm">Drop files or click to upload from device</p>
        <p className="text-a7-text/30 text-xs mt-1">
          Video up to 500MB · images up to 25MB · audio up to 100MB
        </p>
      </label>

      {connections.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-a7-text/40 mb-3 font-mono">
            Pick from connected storage
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {connections.map((c) => {
              const meta = PROVIDERS.find((p) => p.id === c.provider);
              if (!meta) return null;
              return (
                <a
                  key={c.provider}
                  href="/vault?tab=import"
                  className="rounded-lg p-4 flex items-center gap-3 transition-all hover:scale-[1.005]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245,240,232,0.025), rgba(245,240,232,0.005))',
                    border: '1px solid rgba(245,240,232,0.08)',
                  }}
                >
                  <meta.Icon size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-a7-text">{meta.name}</div>
                    <div className="text-xs text-a7-text/40 truncate">{c.account}</div>
                  </div>
                  <ArrowRightIcon size={16} />
                </a>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
          Or paste a URL
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void importUrl();
              }
            }}
            placeholder="https://example.com/clip.mp4"
            className="flex-1 px-4 py-3 rounded-md text-sm bg-a7-base border border-a7-text/[0.08] text-a7-text placeholder:text-a7-text/20 focus:outline-none focus:border-grad-teal"
          />
          <button
            onClick={() => void importUrl()}
            disabled={!urlInput.trim() || urlImporting}
            className="px-4 py-3 rounded-md text-sm font-medium text-a7-void transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              boxShadow: urlInput.trim() ? '0 0 12px rgba(45,212,191,0.2)' : 'none',
            }}
          >
            {urlImporting ? 'Importing…' : 'Import'}
          </button>
        </div>
        {urlError && (
          <p className="mt-2 text-xs" style={{ color: '#E8B06A' }}>
            {urlError}
          </p>
        )}
      </div>

      {(uploadingItems.length > 0 || files.length > 0) && (
        <div className="mt-6">
          <div className="text-[11px] uppercase tracking-wider text-a7-text/40 mb-3 font-mono">
            Your vault
          </div>
          <ul
            className="rounded-lg overflow-hidden divide-y divide-a7-text/[0.04]"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.04)',
            }}
          >
            {uploadingItems.map((u) => (
              <li key={u.id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-[10px] font-mono uppercase tracking-wide text-a7-text/40 w-12">
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
            {files.slice(0, 8).map((f) => (
              <li key={f.id} className="px-4 py-3 flex items-center gap-3">
                <span
                  className="text-[10px] font-mono uppercase tracking-wide w-12"
                  style={{
                    color: f.folder === 'references' ? '#5BE8D5' : f.folder === 'footage' ? '#D4944A' : '#E8B06A',
                  }}
                >
                  /{f.folder.slice(0, 3)}
                </span>
                <span className="flex-1 truncate text-sm text-a7-text/80">{f.filename}</span>
                <span className="text-xs text-a7-text/40">{formatBytes(f.size_bytes)}</span>
              </li>
            ))}
          </ul>
          {files.length > 8 && (
            <div className="text-[11px] text-a7-text/30 mt-2 text-right font-mono">
              + {files.length - 8} more in your vault
            </div>
          )}
        </div>
      )}

      <NavRow
        onBack={onBack}
        nextLabel={hasContent ? 'Continue' : 'Continue without content'}
        onNext={onNext}
      />
    </div>
  );
}

// ─── Step 4: Studio ──────────────────────────────────────────────────────────

function StudioStep({
  vaultName,
  fileCount,
  storageBytes,
  files,
  onFinish,
  onBack,
}: {
  vaultName: string;
  fileCount: number;
  storageBytes: number;
  files: VaultFile[];
  onFinish: () => Promise<void> | void;
  onBack: () => void;
}) {
  const refCount = files.filter((f) => f.folder === 'references').length;
  const footageCount = files.filter((f) => f.folder === 'footage').length;
  return (
    <div>
      <Heading
        eyebrow="Step 4 of 4"
        title="You're ready to create"
        subtitle="Your vault is set up and your content is staged. Next, head into the studio — pick references and footage straight from your vault, and A7 will compose the cut."
      />

      <div
        className="rounded-xl p-6 mb-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(45,212,191,0.06), rgba(184,115,51,0.05))',
          border: '1px solid rgba(245,240,232,0.08)',
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.3), rgba(184,115,51,0.2), transparent)' }}
        />
        <div className="flex items-center gap-4 mb-5">
          <Logo variant="dual" size="md" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-a7-text/40 font-mono">
              Your vault
            </div>
            <div className="font-semibold text-base text-a7-text">{vaultName}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <StatPill label="references" value={refCount.toString()} />
          <StatPill label="footage" value={footageCount.toString()} />
          <StatPill label="storage" value={formatBytes(storageBytes)} />
        </div>
        <div className="text-xs text-a7-text/50 mt-4 text-center">
          {fileCount === 0
            ? "You're starting with an empty vault — no problem. You can add content from inside the studio too."
            : 'Files are encrypted in transit and stored in your private R2 bucket.'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <DestinationCard
          title="Open the studio"
          desc="Pick references and footage from your vault and create your first edit."
          Icon={FilmIcon}
          primary
          onClick={onFinish}
        />
        <DestinationCard
          title="Manage your vault"
          desc="Add more content, browse folders, or organize what you've imported."
          Icon={VaultIcon}
          href="/vault"
        />
      </div>

      <NavRow onBack={onBack} nextLabel="Open the studio →" onNext={onFinish} />
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md p-3"
      style={{
        background: 'linear-gradient(180deg, rgba(10,10,10,0.6), rgba(16,16,14,0.6))',
        border: '1px solid rgba(245,240,232,0.06)',
      }}
    >
      <div className="text-lg font-semibold text-a7-text">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-a7-text/40 font-mono">
        {label}
      </div>
    </div>
  );
}

function DestinationCard({
  title,
  desc,
  Icon,
  primary,
  href,
  onClick,
}: {
  title: string;
  desc: string;
  Icon: typeof FilmIcon;
  primary?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <Icon size={20} gradient={primary ? 'teal' : 'copper'} />
      <div>
        <div className="font-medium text-sm text-a7-text">{title}</div>
        <div className="text-xs text-a7-text/40 mt-0.5">{desc}</div>
      </div>
    </>
  );
  const className =
    'rounded-lg p-4 flex items-start gap-3 transition-all hover:scale-[1.005]';
  const style: React.CSSProperties = primary
    ? {
        background: 'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(45,212,191,0.03))',
        border: '1px solid rgba(45,212,191,0.25)',
        boxShadow: '0 0 16px rgba(45,212,191,0.12)',
      }
    : {
        background: 'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.02))',
        border: '1px solid rgba(184,115,51,0.18)',
      };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left`} style={style}>
        {inner}
      </button>
    );
  }
  return (
    <a href={href} className={className} style={style}>
      {inner}
    </a>
  );
}

// ─── Shared chrome ──────────────────────────────────────────────────────────

function Heading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8 text-center">
      <div className="text-[10px] uppercase tracking-wider text-a7-text/40 font-mono mb-2">
        {eyebrow}
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-a7-text mb-3">{title}</h1>
      <p className="text-sm text-a7-text/50 max-w-xl mx-auto">{subtitle}</p>
    </div>
  );
}

function NavRow({
  onBack,
  backHref,
  backLabel,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack?: () => void;
  backHref?: string;
  backLabel?: string;
  onNext: () => void | Promise<void>;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-3 mt-8">
      {onBack && (
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-md font-medium text-sm transition-all"
          style={{
            background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
            border: '1px solid rgba(245,240,232,0.06)',
            color: 'rgba(245,240,232,0.5)',
          }}
        >
          Back
        </button>
      )}
      {backHref && !onBack && (
        <a
          href={backHref}
          className="flex-1 py-3 rounded-md font-medium text-sm transition-all text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
            border: '1px solid rgba(245,240,232,0.06)',
            color: 'rgba(245,240,232,0.5)',
          }}
        >
          {backLabel ?? 'Back'}
        </a>
      )}
      <button
        onClick={() => void onNext()}
        disabled={nextDisabled}
        className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
          boxShadow: nextDisabled ? 'none' : '0 0 18px rgba(45,212,191,0.25)',
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}
