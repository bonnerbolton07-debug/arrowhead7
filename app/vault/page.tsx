import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import {
  GoogleDriveIcon,
  DropboxIcon,
  ICloudIcon,
  VaultIcon,
  SearchIcon,
  CloudIcon,
} from '@/components/ui/icons';
import { TIER_LIMITS, type SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';

type Provider = 'google_drive' | 'dropbox' | 'icloud' | 'onedrive';

interface StorageRow {
  id: string;
  provider: Provider;
  account_email: string | null;
  account_name: string | null;
  connection_status: string;
  storage_used_bytes: number;
  storage_quota_bytes: number | null;
  last_sync_at: string | null;
  created_at: string;
}

const PROVIDERS: {
  id: Provider;
  name: string;
  description: string;
  Icon: typeof GoogleDriveIcon;
}[] = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    description: 'Pull footage from My Drive or shared folders.',
    Icon: GoogleDriveIcon,
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Sync your camera roll and team drives.',
    Icon: DropboxIcon,
  },
  {
    id: 'icloud',
    name: 'iCloud Drive',
    description: 'Browse footage from your Apple devices.',
    Icon: ICloudIcon,
  },
];

async function fetchData(): Promise<{
  tier: SubscriptionTier;
  connections: StorageRow[];
  vaultUsedBytes: number;
}> {
  if (!isSupabaseConfigured()) {
    return { tier: 'free', connections: [], vaultUsedBytes: 0 };
  }
  const user = await getUser();
  if (!user) return { tier: 'free', connections: [], vaultUsedBytes: 0 };

  const supabase = await createServerSupabaseClient();
  const [profileRes, connsRes] = await Promise.all([
    supabase.from('profiles').select('subscription_tier').eq('id', user.id).single(),
    supabase
      .from('storage_connections')
      .select(
        'id, provider, account_email, account_name, connection_status, storage_used_bytes, storage_quota_bytes, last_sync_at, created_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const tier = (profileRes.data?.subscription_tier as SubscriptionTier) ?? 'free';
  const connections = (connsRes.data ?? []) as StorageRow[];
  const vaultUsedBytes = connections.reduce((sum, c) => sum + (c.storage_used_bytes ?? 0), 0);

  return { tier, connections, vaultUsedBytes };
}

export default async function VaultPage() {
  const { tier, connections, vaultUsedBytes } = await fetchData();
  const limits = TIER_LIMITS[tier];
  const quotaBytes = limits.storage_gb === -1 ? -1 : limits.storage_gb * 1024 ** 3;

  return (
    <DashboardShell
      title="Smart Vault"
      subtitle="Your footage, AI-tagged and instantly searchable. Connect cloud storage to bring everything in."
      actions={
        <SearchInput placeholder="Search vault…" />
      }
    >
      <div className="max-w-6xl space-y-10">
        {/* Usage card */}
        <UsageCard
          usedBytes={vaultUsedBytes}
          quotaBytes={quotaBytes}
          tier={tier}
        />

        {/* Connect storage */}
        <section>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-a7-text">
                Cloud storage
              </h2>
              <p className="text-xs text-a7-text/40 mt-1">
                Link your storage and pull footage straight into the editor.
              </p>
            </div>
            <div className="text-xs text-a7-text/40">
              {connections.length} connected
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROVIDERS.map((p) => {
              const existing = connections.find((c) => c.provider === p.id);
              return (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  connection={existing}
                />
              );
            })}
          </div>
        </section>

        {/* Browse imported footage */}
        <section>
          <h2 className="text-base font-semibold text-a7-text mb-4">
            Browse storage
          </h2>
          <BrowsePanel hasConnections={connections.length > 0} />
        </section>
      </div>
    </DashboardShell>
  );
}

function UsageCard({
  usedBytes,
  quotaBytes,
  tier,
}: {
  usedBytes: number;
  quotaBytes: number;
  tier: SubscriptionTier;
}) {
  const usedGb = usedBytes / 1024 ** 3;
  const quotaGb = quotaBytes === -1 ? -1 : quotaBytes / 1024 ** 3;
  const pct = quotaBytes === -1 ? 0 : Math.min((usedBytes / quotaBytes) * 100, 100);

  return (
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
        <div>
          <div className="text-[10px] uppercase tracking-wider text-a7-text/40 font-mono mb-2">
            Vault usage
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-a7-text">
              {usedGb.toFixed(1)} GB
            </span>
            <span className="text-sm text-a7-text/40">
              of {quotaGb === -1 ? 'unlimited' : `${quotaGb} GB`}
            </span>
          </div>
          <div
            className="w-full rounded-full h-2 overflow-hidden"
            style={{ background: 'rgba(245,240,232,0.06)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: quotaGb === -1 ? '30%' : `${pct}%`,
                background:
                  pct > 90
                    ? 'linear-gradient(90deg, #B87333, #EF4444)'
                    : 'linear-gradient(90deg, #1a9e8f, #2DD4BF, #5BE8D5)',
                boxShadow: '0 0 12px rgba(45,212,191,0.3)',
              }}
            />
          </div>
        </div>
        {tier === 'free' && (
          <a
            href="/pricing"
            className="px-4 py-2 rounded-md text-sm font-medium text-a7-void"
            style={{
              background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              boxShadow: '0 0 16px rgba(45,212,191,0.22)',
            }}
          >
            Get more storage
          </a>
        )}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  connection,
}: {
  provider: { id: Provider; name: string; description: string; Icon: typeof GoogleDriveIcon };
  connection?: StorageRow;
}) {
  const connected = !!connection;
  const usedGb = connection ? connection.storage_used_bytes / 1024 ** 3 : 0;
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
        <provider.Icon size={28} />
        {connected && (
          <span
            className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(45,212,191,0.08)',
              color: '#2DD4BF',
              border: '1px solid rgba(45,212,191,0.2)',
            }}
          >
            {connection?.connection_status ?? 'connected'}
          </span>
        )}
      </div>

      <h3 className="font-semibold text-sm text-a7-text mb-1">{provider.name}</h3>
      <p className="text-xs text-a7-text/40 mb-4 flex-1">
        {connected
          ? connection?.account_email ??
            connection?.account_name ??
            'Connected account'
          : provider.description}
      </p>

      {connected && (
        <div className="text-[10px] text-a7-text/40 font-mono mb-3">
          {usedGb.toFixed(1)} GB indexed
        </div>
      )}

      <button
        disabled
        className="w-full px-3 py-2 rounded-md text-xs font-medium transition-all disabled:cursor-not-allowed"
        style={
          connected
            ? {
                background:
                  'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                border: '1px solid rgba(245,240,232,0.06)',
                color: 'rgba(245,240,232,0.5)',
              }
            : {
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                color: '#0A0A0A',
                boxShadow: '0 0 12px rgba(45,212,191,0.2)',
                opacity: 0.5,
              }
        }
        title={connected ? 'Manage connection' : 'OAuth coming soon'}
      >
        {connected ? 'Manage' : 'Connect'}
      </button>
    </div>
  );
}

function BrowsePanel({ hasConnections }: { hasConnections: boolean }) {
  if (!hasConnections) {
    return (
      <div
        className="relative overflow-hidden rounded-lg p-12 text-center"
        style={{
          background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
          border: '1px solid rgba(245,240,232,0.04)',
        }}
      >
        <CloudIcon size={32} gradient="teal" className="mx-auto mb-3 opacity-40" />
        <p className="text-a7-text/40 text-sm max-w-md mx-auto">
          Connect a storage provider above to browse and import footage straight
          into the editor.
        </p>
      </div>
    );
  }

  // Placeholder folder grid — wired up once OAuth lands.
  const FOLDERS = [
    'Camera Roll',
    'Drone footage',
    '2025 Shoots',
    'B-roll archive',
    'Client work',
    'Tutorials',
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {FOLDERS.map((f) => (
        <button
          key={f}
          disabled
          className="relative overflow-hidden rounded-lg p-4 text-left transition-all opacity-60"
          style={{
            background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
            border: '1px solid rgba(245,240,232,0.05)',
          }}
        >
          <VaultIcon size={20} gradient="copper" className="mb-2" />
          <div className="text-sm font-medium text-a7-text/80 truncate">{f}</div>
          <div className="text-[10px] text-a7-text/30 mt-1">— files</div>
        </button>
      ))}
    </div>
  );
}

function SearchInput({ placeholder }: { placeholder: string }) {
  return (
    <div
      className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-md w-64"
      style={{ background: '#0C0C0A', border: '1px solid rgba(245,240,232,0.06)' }}
    >
      <SearchIcon size={14} gradient="teal" />
      <input
        placeholder={placeholder}
        disabled
        className="bg-transparent text-sm text-a7-text placeholder:text-a7-text/30 focus:outline-none w-full"
      />
    </div>
  );
}
