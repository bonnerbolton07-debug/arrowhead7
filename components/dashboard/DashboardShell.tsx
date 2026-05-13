import { Sidebar, MobileNavStrip } from './Sidebar';
import { getUser, createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { SubscriptionTier } from '@/types';
import { TIER_LIMITS } from '@/types';

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Server component — fetches user + profile and renders the persistent
 * dashboard chrome (sidebar, mobile nav, header). Use this for every page
 * under /dashboard/* and /vault.
 */
export async function DashboardShell({
  title,
  subtitle,
  actions,
  children,
}: DashboardShellProps) {
  const user = await getUser();

  let tier: SubscriptionTier = 'free';
  let creditsRemaining = TIER_LIMITS.free.credits_per_month;
  let creditsTotal: number = TIER_LIMITS.free.credits_per_month;

  if (user && isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, credits_remaining')
        .eq('id', user.id)
        .single();
      if (profile?.subscription_tier) {
        tier = profile.subscription_tier as SubscriptionTier;
        creditsTotal = TIER_LIMITS[tier]?.credits_per_month ?? creditsTotal;
        if (typeof profile.credits_remaining === 'number') {
          creditsRemaining = profile.credits_remaining;
        }
      }
    } catch {
      // Fall back to defaults.
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void">
      <Sidebar
        userEmail={user?.email ?? null}
        tier={tier}
        creditsRemaining={creditsRemaining}
        creditsTotal={creditsTotal}
      />

      <main className="md:ml-64 pb-20 md:pb-8">
        <header className="px-5 sm:px-8 pt-8 sm:pt-10 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 max-w-6xl">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-a7-text">{title}</h1>
              {subtitle && (
                <p className="text-a7-text/40 text-sm mt-1">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>

        <div className="px-5 sm:px-8">{children}</div>
      </main>

      <MobileNavStrip />
    </div>
  );
}
