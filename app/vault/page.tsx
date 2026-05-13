// =============================================================================
// Arrowhead 7 — Smart Vault
// =============================================================================
// Browse + import footage from connected cloud storage.

import { Logo } from '@/components/ui/Logo';
import { getUser, createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { VaultBrowser } from './VaultBrowser';

export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  const user = await getUser();
  if (!user) redirect('/auth/login?next=/vault');

  const supabase = await createServerSupabaseClient();
  const { data: clouds } = await supabase
    .from('cloud_connections')
    .select('id, provider, account_name, account_email')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  const connected = (clouds ?? []).reduce<Record<string, { account: string }>>(
    (acc, c) => {
      const account = c.account_email ?? c.account_name ?? 'Connected';
      acc[c.provider] = { account };
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void">
      <header className="border-b border-a7-text/[0.04] px-6 py-5 flex items-center gap-3">
        <a href="/dashboard" className="flex items-center gap-2">
          <Logo variant="dual" size="sm" wordmark />
        </a>
        <span className="text-a7-text/30 text-sm ml-3">/ Smart Vault</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-2 text-a7-text">Smart Vault</h1>
        <p className="text-a7-text/40 text-sm mb-8">
          Pull source footage from Google Drive or Dropbox directly into A7. Files
          are streamed into your private R2 bucket — never the browser.
        </p>

        <VaultBrowser connected={connected} />
      </main>
    </div>
  );
}
