import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { TIER_LIMITS, type SubscriptionTier, type Platform } from '@/types';
import {
  YouTubeIcon,
  TikTokIcon,
  InstagramIcon,
  XIcon,
  LinkedInIcon,
  ShareIcon,
  CheckIcon,
} from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

interface ConnectedChannel {
  id: string;
  platform: Platform;
  platform_account_name: string;
  platform_avatar_url: string | null;
  connection_status: string;
  last_sync_at: string | null;
  created_at: string;
}

interface DistributionRow {
  id: string;
  channel_id: string;
  title: string;
  status: string;
  platform: Platform;
  published_at: string | null;
  platform_url: string | null;
  created_at: string;
}

const PLATFORMS: {
  id: Platform;
  name: string;
  description: string;
  Icon: typeof YouTubeIcon;
}[] = [
  { id: 'youtube', name: 'YouTube', description: 'Long-form + Shorts', Icon: YouTubeIcon },
  { id: 'tiktok', name: 'TikTok', description: 'Vertical short-form', Icon: TikTokIcon },
  { id: 'instagram', name: 'Instagram', description: 'Reels, Feed, Stories', Icon: InstagramIcon },
  { id: 'twitter', name: 'X', description: 'Video posts + threads', Icon: XIcon },
  { id: 'linkedin', name: 'LinkedIn', description: 'Professional posts', Icon: LinkedInIcon },
];

async function fetchData(): Promise<{
  tier: SubscriptionTier;
  channels: ConnectedChannel[];
  distributions: DistributionRow[];
}> {
  if (!isSupabaseConfigured()) {
    return { tier: 'free', channels: [], distributions: [] };
  }
  const user = await getUser();
  if (!user) return { tier: 'free', channels: [], distributions: [] };

  const supabase = await createServerSupabaseClient();

  const [profileRes, channelsRes, distsRes] = await Promise.all([
    supabase.from('profiles').select('subscription_tier').eq('id', user.id).single(),
    supabase
      .from('channels')
      .select(
        'id, platform, platform_account_name, platform_avatar_url, connection_status, last_sync_at, created_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('distributions')
      .select(
        'id, channel_id, title, status, platform, published_at, platform_url, created_at'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const tier = (profileRes.data?.subscription_tier as SubscriptionTier) ?? 'free';

  return {
    tier,
    channels: (channelsRes.data ?? []) as ConnectedChannel[],
    distributions: (distsRes.data ?? []) as DistributionRow[],
  };
}

export default async function ChannelsPage() {
  const { tier, channels, distributions } = await fetchData();
  const limit = TIER_LIMITS[tier].max_channels;
  const atLimit = limit !== -1 && channels.length >= limit;

  return (
    <DashboardShell
      title="Channels"
      subtitle="Connect your social accounts to push edits directly from A7."
    >
      <div className="max-w-6xl space-y-10">
        {/* Connect new platforms */}
        <section>
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-base font-semibold text-a7-text">Available platforms</h2>
            <div className="text-xs text-a7-text/40">
              {limit === -1
                ? `${channels.length} connected · Unlimited`
                : `${channels.length} / ${limit} connected`}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORMS.map((p) => {
              const existing = channels.find((c) => c.platform === p.id);
              return (
                <PlatformCard
                  key={p.id}
                  platform={p}
                  connected={!!existing}
                  status={existing?.connection_status}
                  accountName={existing?.platform_account_name}
                  disabled={!existing && atLimit}
                />
              );
            })}
          </div>

          {atLimit && (
            <div
              className="mt-4 px-4 py-3 rounded-md text-sm flex items-center justify-between"
              style={{
                background:
                  'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.02))',
                border: '1px solid rgba(184,115,51,0.2)',
                color: '#D4944A',
              }}
            >
              <span>You&rsquo;ve hit the {tier} plan channel limit.</span>
              <a href="/pricing" className="font-medium hover:underline">
                Upgrade →
              </a>
            </div>
          )}
        </section>

        {/* Distribution history */}
        <section>
          <h2 className="text-base font-semibold text-a7-text mb-4">
            Distribution history
          </h2>
          {distributions.length === 0 ? (
            <div
              className="rounded-lg p-12 text-center"
              style={{
                background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: '1px solid rgba(245,240,232,0.04)',
              }}
            >
              <ShareIcon size={28} gradient="teal" className="mx-auto mb-3 opacity-40" />
              <p className="text-a7-text/40 text-sm">
                Once you publish edits to a connected channel, the history will live here.
              </p>
            </div>
          ) : (
            <DistributionHistory
              distributions={distributions}
              channels={channels}
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

function PlatformCard({
  platform,
  connected,
  status,
  accountName,
  disabled,
}: {
  platform: { id: Platform; name: string; description: string; Icon: typeof YouTubeIcon };
  connected: boolean;
  status?: string;
  accountName?: string;
  disabled: boolean;
}) {
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
        boxShadow: connected ? '0 0 18px rgba(45,212,191,0.08)' : 'none',
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
        <platform.Icon size={28} />
        {connected && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(45,212,191,0.08)',
              color: '#2DD4BF',
              border: '1px solid rgba(45,212,191,0.2)',
            }}
          >
            <CheckIcon size={10} gradient="teal" />
            {status === 'connected' ? 'Connected' : status ?? 'Connected'}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-sm text-a7-text mb-1">{platform.name}</h3>
      <p className="text-xs text-a7-text/40 mb-4 flex-1">
        {connected && accountName
          ? `@${accountName.replace(/^@/, '')}`
          : platform.description}
      </p>

      <button
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
        title={connected ? 'Manage in settings' : 'OAuth coming soon'}
      >
        {connected ? 'Manage' : disabled ? 'Plan limit reached' : 'Connect'}
      </button>
    </div>
  );
}

function DistributionHistory({
  distributions,
  channels,
}: {
  distributions: DistributionRow[];
  channels: ConnectedChannel[];
}) {
  const grouped = distributions.reduce<Record<string, DistributionRow[]>>((acc, d) => {
    (acc[d.platform] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([platform, rows]) => {
        const channel = channels.find((c) => c.platform === platform);
        const meta = PLATFORMS.find((p) => p.id === (platform as Platform));
        return (
          <div
            key={platform}
            className="relative overflow-hidden rounded-lg"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.05)',
            }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between border-b"
              style={{ borderColor: 'rgba(245,240,232,0.04)' }}
            >
              <div className="flex items-center gap-3">
                {meta && <meta.Icon size={18} />}
                <div>
                  <div className="font-medium text-sm text-a7-text capitalize">
                    {meta?.name ?? platform}
                  </div>
                  {channel && (
                    <div className="text-[10px] text-a7-text/30 font-mono">
                      @{channel.platform_account_name.replace(/^@/, '')}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-a7-text/40">{rows.length} posts</div>
            </div>
            <ul>
              {rows.slice(0, 5).map((d) => (
                <li
                  key={d.id}
                  className="px-4 py-3 flex items-center justify-between border-b last:border-b-0 text-sm"
                  style={{ borderColor: 'rgba(245,240,232,0.03)' }}
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <a
                      href={d.platform_url ?? '#'}
                      target={d.platform_url ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="text-a7-text/80 hover:text-a7-text truncate block"
                    >
                      {d.title}
                    </a>
                    <div className="text-[10px] text-a7-text/30">
                      {d.published_at
                        ? new Date(d.published_at).toLocaleString()
                        : new Date(d.created_at).toLocaleString()}
                    </div>
                  </div>
                  <DistributionStatus status={d.status} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DistributionStatus({ status }: { status: string }) {
  const color =
    status === 'published'
      ? '#2DD4BF'
      : status === 'failed'
      ? '#EF4444'
      : '#D4944A';
  return (
    <span
      className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full"
      style={{
        background: `${color}14`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {status}
    </span>
  );
}
