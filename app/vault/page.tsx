import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TIER_LIMITS, type SubscriptionTier } from '@/types';
import { VaultManager } from './VaultManager';
import type { VaultFile } from '@/lib/vault';

export const dynamic = 'force-dynamic';

interface VaultPageData {
  tier: SubscriptionTier;
  files: VaultFile[];
  storageBytes: number;
  fileCount: number;
  vaultName: string;
  connections: { provider: string; account: string }[];
}

async function fetchData(): Promise<VaultPageData> {
  const empty: VaultPageData = {
    tier: 'free',
    files: [],
    storageBytes: 0,
    fileCount: 0,
    vaultName: 'My Vault',
    connections: [],
  };
  if (!isSupabaseConfigured()) return empty;
  const user = await getUser();
  if (!user) return empty;

  const supabase = await createServerSupabaseClient();
  const [profileRes, filesRes, cloudsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'subscription_tier, vault_name, vault_storage_bytes, vault_file_count'
      )
      .eq('id', user.id)
      .single(),
    supabase
      .from('vault_files')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('cloud_connections')
      .select('provider, account_email, account_name')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
  ]);

  const profile = profileRes.data;
  const tier = (profile?.subscription_tier as SubscriptionTier) ?? 'free';

  const connections = ((cloudsRes.data ?? []) as Array<{
    provider: string;
    account_email: string | null;
    account_name: string | null;
  }>).map((c) => ({
    provider: c.provider,
    account: c.account_email ?? c.account_name ?? 'Connected',
  }));

  return {
    tier,
    files: (filesRes.data ?? []) as VaultFile[],
    storageBytes: Number(profile?.vault_storage_bytes ?? 0),
    fileCount: Number(profile?.vault_file_count ?? 0),
    vaultName: profile?.vault_name ?? 'My Vault',
    connections,
  };
}

export default async function VaultPage() {
  if (isSupabaseConfigured()) {
    const user = await getUser();
    if (!user) redirect('/auth/login?next=/vault');
  }

  const data = await fetchData();
  const limits = TIER_LIMITS[data.tier];
  const quotaBytes = limits.storage_gb === -1 ? -1 : limits.storage_gb * 1024 ** 3;

  return (
    <DashboardShell
      title={data.vaultName}
      subtitle="Your private content library. References for style, footage for editing, exports for sharing."
    >
      <div className="max-w-6xl">
        <VaultManager
          initialFiles={data.files}
          initialStorageBytes={data.storageBytes}
          initialFileCount={data.fileCount}
          quotaBytes={quotaBytes}
          tier={data.tier}
          connections={data.connections}
        />
      </div>
    </DashboardShell>
  );
}
