import { redirect } from 'next/navigation';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import { OnboardingClient } from './OnboardingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Welcome — ARENAXOS',
  description: 'Set up your vault and start creating with ARENAXOS.',
};

type OnboardingStep = 'vault' | 'sources' | 'import' | 'studio' | 'done';

interface OnboardingState {
  step: OnboardingStep;
  completedAt: string | null;
  vaultName: string;
  storageBytes: number;
  fileCount: number;
  connections: { provider: string; account: string }[];
  email: string;
}

async function loadState(): Promise<OnboardingState | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();
  const [profileRes, cloudsRes, filesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'onboarding_step, onboarding_completed_at, vault_name, vault_storage_bytes, vault_file_count, display_name'
      )
      .eq('id', user.id)
      .single(),
    supabase
      .from('cloud_connections')
      .select('provider, account_email, account_name')
      .eq('user_id', user.id),
    supabase
      .from('vault_files')
      .select('id')
      .eq('user_id', user.id)
      .limit(1),
  ]);

  const profile = profileRes.data;
  const clouds = (cloudsRes.data ?? []) as Array<{
    provider: string;
    account_email: string | null;
    account_name: string | null;
  }>;

  const fileCount = Number(profile?.vault_file_count ?? 0);
  const storageBytes = Number(profile?.vault_storage_bytes ?? 0);
  let step: OnboardingStep =
    (profile?.onboarding_step as OnboardingStep) ?? 'vault';
  // Auto-advance the step pointer if the user already has content from a
  // prior session so we don't make them redo finished steps.
  if (step === 'vault' && profile?.vault_name) step = 'sources';
  if (step === 'sources' && clouds.length > 0) step = 'import';
  if (step === 'import' && (filesRes.data ?? []).length > 0) step = 'studio';

  return {
    step,
    completedAt: profile?.onboarding_completed_at ?? null,
    vaultName: profile?.vault_name ?? '',
    storageBytes,
    fileCount,
    connections: clouds.map((c) => ({
      provider: c.provider,
      account: c.account_email ?? c.account_name ?? 'Connected',
    })),
    email: user.email ?? '',
  };
}

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    redirect('/dashboard');
  }
  const state = await loadState();
  if (!state) {
    redirect('/auth/login?next=/onboarding');
  }
  if (state.completedAt) {
    redirect('/dashboard');
  }

  return <OnboardingClient initial={state} />;
}
