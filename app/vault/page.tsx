import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  GoogleDriveIcon,
  DropboxIcon,
  ICloudIcon,
  VaultIcon,
  SearchIcon,
  CloudIcon,
} from '@/components/ui/icons';
import { TIER_LIMITS, type SubscriptionTier } from '@/types';
import { VaultBrowser } from './VaultBrowser';
import { IcloudShareCard } from './IcloudShareCard';

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
  oauthSlug?: string;
}[] = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    description: 'Pull footage from My Drive or shared folders.',
    Icon: GoogleDriveIcon,
    oauthSlug: 'google-drive',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Sync your camera roll and team drives.',
    Icon: DropboxIcon,
    oauthSlug: 'dropbox',
  },
  {
    id: 'icloud',
    name: 'iCloud Drive',
    description: 'Import via public share link from the iCloud Files app.',
    Icon: ICloudIcon,
  },
];

async function fetchData(): Promise<{
  tier: SubscriptionTier;
  connections: StorageRow[];
  vaultUsedBytes: number;
  browserConnected: Record<string, { account: string }>;
}> {
  if (!isSupabaseConfigured()) {
    return { tier: 'free', connections: [], vaultUsedBytes: 0, browserConnected: {} };
  }
  const user = await getUser();
  if (!user)
    return { tier: 'free', connections: [], vaultUsedBytes: 0, browserConnected: {} };

  const supabase = await createServerSupabaseClient();
  const [profileRes, legacyRes, cloudsRes] = await Promise.all([
    supabase.from('profiles').select('subscription_tier').eq('id', user.id).single(),
    supabase
      .from('storage_connections')
      .select(
        'id, provider, account_email, account_name, connection_status, storage_used_bytes, storage_quota_bytes, last_sync_at, created_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('cloud_connections')
      .select(
        'id, provider, account_email, account_name, connection_status, created_at, updated_at'
      )
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ]);

  const tier = (profileRes.data?.subscription_tier as SubscriptionTier) ?? 'free';
  const legacy = (legacyRes.data ?? []) as StorageRow[];
  const clouds = (cloudsRes.data ?? []) as Array<{
    id: string;
    provider: string;
    account_email: string | null;
    account_name: string | null;
    connection_status: string;
    created_at: string;
  }>;

  // Merge: cloud_connections (real OAuth) takes precedence per provider.
  const byProvider = new Map<string, StorageRow>();
  for (const row of legacy) byProvider.set(row.provider, row);
  for (const c of clouds) {
    byProvider.set(c.provider, {
      id: c.id,
      provider: c.provider as Provider,
      account_email: c.account_email,
      account_name: c.account_name,
      connection_status: c.connection_status,
      storage_used_bytes:
        byProvider.get(c.provider)?.storage_used_bytes ?? 0,
      storage_quota_bytes:
        byProvider.get(c.provider)?.storage_quota_bytes ?? null,
      last_sync_at: byProvider.get(c.provider)?.last_sync_at ?? null,
      created_at: c.created_at,
    });
  }

  const connections = Array.from(byProvider.values());
  const vaultUsedBytes = connections.reduce(
    (sum, c) => sum + (c.storage_used_bytes ?? 0),
    0
  );

  const browserConnected = clouds.reduce<Record<string, { account: string }>>(
    (acc, c) => {
      const account = c.account_email ?? c.account_name ?? 'Connected';
      acc[c.provider] = { account };
      return acc;
    },
    {}
  );

  return { tier, connections, vaultUsedBytes, browserConnected };
}

export default async function VaultPage() {
  if (isSupabaseConfigured()) {
    const user = await getUser();
    if (!user) redirect('/auth/login?next=/vault');
  }

  const { tier, connections, vaultUsedBytes, browserConnected } = await fetchData();
  const limits = TIER_LIMITS[tier];
  const quotaBytes = limits.storage_gb === -1 ? -1 : limits.storage_gb * 1024 ** 3;

  return (
    <DashboardShell
      title="Smart Vault"
      subtitle="Your footage, AI-tagged and instantly searchable. Connect cloud storage to bring everything in."
      actions={<SearchInput placeholder="Search vault…" />}
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
              if (p.id === 'icloud') {
                return (
                  <IcloudShareCard
                    key={p.id}
                    connected={!!existing}
                    connectedAccount={existing?.account_name ?? existing?.account_email ?? null}
                  />
                );
              }
              return (
                <ProviderCard key={p.id} provider={p} connection={existing} />
              );
            })}
          </div>
        </section>

        {/* Browse imported footage */}
        <section>
          <h2 className="text-base font-semibold text-a7-text mb-4">
            Browse storage
          </h2>
          <BrowsePanel
            hasConnections={Object.keys(browserConnected).length > 0}
            connected={browserConnected}
          />
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
  provider: {
    id: Provider;
    name: string;
    description: string;
    Icon: typeof GoogleDriveIcon;
    oauthSlug?: string;
  };
  connection?: StorageRow;
}) {
  const connected = !!connection;
  const usedGb = connection ? connection.storage_used_bytes / 1024 ** 3 : 0;
  const connectHref = provider.oauthSlug
    ? `/api/auth/${provider.oauthSlug}/connect?next=/vault`
    : undefined;
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

      {connected && usedGb > 0 && (
        <div className="text-[10px] text-a7-text/40 font-mono mb-3">
          {usedGb.toFixed(1)} GB indexed
        </div>
      )}

      {connectHref ? (
        <a
          href={connectHref}
          className="w-full px-3 py-2 rounded-md text-xs font-medium transition-all text-center"
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
                }
          }
        >
          {connected ? 'Reconnect' : 'Connect'}
        </a>
      ) : (
        <button
          disabled
          className="w-full px-3 py-2 rounded-md text-xs font-medium opacity-40 cursor-not-allowed"
          style={{
            background:
              'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
            border: '1px solid rgba(245,240,232,0.06)',
            color: 'rgba(245,240,232,0.5)',
          }}
          title="Coming soon"
        >
          Coming soon
        </button>
      )}
    </div>
  );
}

function BrowsePanel({
  hasConnections,
  connected,
}: {
  hasConnections: boolean;
  connected: Record<string, { account: string }>;
}) {
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
        <div className="mt-4 text-[10px] text-a7-text/30 font-mono">
          <VaultIcon size={14} gradient="copper" className="inline-block mr-1" />
          Files are streamed into your private R2 bucket — never the browser.
        </div>
      </div>
    );
  }

  return <VaultBrowser connected={connected} />;
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
