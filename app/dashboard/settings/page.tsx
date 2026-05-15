import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { ProfileSection } from './ProfileSection';
import { SubscriptionSection } from './SubscriptionSection';
import { NotificationSection } from './NotificationSection';
import { ApiKeysSection } from './ApiKeysSection';
import { DangerZone } from './DangerZone';
import type { SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';

interface ProfileData {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  subscription_status: string;
  current_period_end: string | null;
  credits_remaining: number;
  stripe_customer_id: string | null;
}

interface NotificationPrefs {
  email_render_complete: boolean;
  email_render_failed: boolean;
  email_billing: boolean;
  email_product_updates: boolean;
  email_security_alerts: boolean;
  in_app_render_complete: boolean;
  in_app_render_failed: boolean;
  in_app_distribution_done: boolean;
}

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface ConnectedAccount {
  type: 'channel' | 'storage';
  provider: string;
  name: string;
  status: string;
}

async function loadData(searchParams: Record<string, string | undefined>) {
  const user = await getUser();
  const checkoutResult = searchParams.checkout ?? null;

  if (!user || !isSupabaseConfigured()) {
    return {
      user: null,
      profile: null,
      notificationPrefs: null,
      apiKeys: [],
      connectedAccounts: [],
      checkoutResult,
    };
  }

  const supabase = await createServerSupabaseClient();

  const [profileRes, notifRes, apiKeysRes, channelsRes, storageRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, display_name, avatar_url, subscription_tier, subscription_status, current_period_end, credits_remaining, stripe_customer_id'
      )
      .eq('id', user.id)
      .single(),
    supabase
      .from('notification_preferences')
      .select(
        'email_render_complete, email_render_failed, email_billing, email_product_updates, email_security_alerts, in_app_render_complete, in_app_render_failed, in_app_distribution_done'
      )
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('api_keys')
      .select('id, name, prefix, scopes, last_used_at, revoked_at, created_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('channels')
      .select('platform, platform_account_name, connection_status')
      .eq('user_id', user.id),
    supabase
      .from('cloud_connections')
      .select('provider, account_name, connection_status')
      .eq('user_id', user.id),
  ]);

  const profile = (profileRes.data as ProfileData | null) ?? null;
  const notificationPrefs = (notifRes.data as NotificationPrefs | null) ?? null;
  const apiKeys = (apiKeysRes.data ?? []) as ApiKeyRow[];

  const connectedAccounts: ConnectedAccount[] = [];
  for (const c of channelsRes.data ?? []) {
    connectedAccounts.push({
      type: 'channel',
      provider: c.platform as string,
      name: c.platform_account_name as string,
      status: c.connection_status as string,
    });
  }
  for (const s of storageRes.data ?? []) {
    connectedAccounts.push({
      type: 'storage',
      provider: s.provider as string,
      name: (s.account_name as string) ?? (s.provider as string),
      status: s.connection_status as string,
    });
  }

  return { user, profile, notificationPrefs, apiKeys, connectedAccounts, checkoutResult };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { user, profile, notificationPrefs, apiKeys, connectedAccounts, checkoutResult } =
    await loadData(sp);

  return (
    <DashboardShell
      title="Settings"
      subtitle="Profile, billing, notifications, integrations."
    >
      <div className="max-w-3xl space-y-8">
        {checkoutResult === 'success' && (
          <div
            className="px-4 py-3 rounded-md text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
              border: '1px solid rgba(45,212,191,0.25)',
              color: '#5BE8D5',
            }}
          >
            Subscription activated. Welcome to the next tier — your new limits are live.
          </div>
        )}

        {!user && (
          <div
            className="px-4 py-3 rounded-md text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
              border: '1px solid rgba(212,148,74,0.25)',
              color: '#E8B06A',
            }}
          >
            Sign in to manage your settings.
          </div>
        )}

        {profile && (
          <>
            <ProfileSection
              email={profile.email}
              displayName={profile.display_name ?? ''}
              avatarUrl={profile.avatar_url}
            />

            <SubscriptionSection
              tier={profile.subscription_tier}
              status={profile.subscription_status}
              currentPeriodEnd={profile.current_period_end}
              creditsRemaining={profile.credits_remaining}
              hasStripeCustomer={!!profile.stripe_customer_id}
            />

            <NotificationSection
              initial={
                notificationPrefs ?? {
                  email_render_complete: true,
                  email_render_failed: true,
                  email_billing: true,
                  email_product_updates: false,
                  email_security_alerts: true,
                  in_app_render_complete: true,
                  in_app_render_failed: true,
                  in_app_distribution_done: true,
                }
              }
            />

            <ConnectedAccountsOverview accounts={connectedAccounts} />

            <ApiKeysSection
              tier={profile.subscription_tier}
              keys={apiKeys}
            />

            <DangerZone />
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function ConnectedAccountsOverview({ accounts }: { accounts: ConnectedAccount[] }) {
  return (
    <section
      className="relative overflow-hidden rounded-lg p-6"
      style={{
        background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
        border: '1px solid rgba(245,240,232,0.05)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)',
        }}
      />
      <h2 className="text-base font-semibold text-a7-text mb-1">Connected accounts</h2>
      <p className="text-xs text-a7-text/40 mb-5">
        Everywhere A7 has access. Manage details in the linked sections.
      </p>

      {accounts.length === 0 ? (
        <p className="text-sm text-a7-text/40">
          Nothing connected yet.{' '}
          <a href="/dashboard/channels" className="text-grad-teal hover:underline">
            Connect a channel
          </a>{' '}
          or{' '}
          <a href="/vault" className="text-grad-teal hover:underline">
            link cloud storage
          </a>
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a, i) => (
            <li
              key={i}
              className="flex items-center justify-between px-3 py-2 rounded-md text-sm"
              style={{ background: '#0C0C0A', border: '1px solid rgba(245,240,232,0.04)' }}
            >
              <div>
                <div className="text-a7-text capitalize">
                  {a.provider.replace(/_/g, ' ')}
                </div>
                <div className="text-[10px] text-a7-text/30 font-mono">
                  {a.type === 'channel' ? `@${a.name.replace(/^@/, '')}` : a.name}
                </div>
              </div>
              <span
                className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full"
                style={{
                  background:
                    a.status === 'connected'
                      ? 'rgba(45,212,191,0.1)'
                      : 'rgba(184,115,51,0.1)',
                  color: a.status === 'connected' ? '#2DD4BF' : '#D4944A',
                  border: `1px solid ${
                    a.status === 'connected'
                      ? 'rgba(45,212,191,0.25)'
                      : 'rgba(184,115,51,0.25)'
                  }`,
                }}
              >
                {a.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex gap-3 text-xs">
        <a href="/dashboard/channels" className="text-grad-teal hover:underline">
          Manage channels →
        </a>
        <a href="/vault" className="text-grad-copper hover:underline">
          Manage storage →
        </a>
      </div>
    </section>
  );
}
