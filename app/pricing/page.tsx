import { Logo } from '@/components/ui/Logo';
import { PricingCards } from '@/components/pricing/PricingCards';
import {
  createServerSupabaseClient,
  getUser,
  isSupabaseConfigured,
} from '@/lib/supabase/server';
import type { SubscriptionTier } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pricing — Arrowhead 7',
  description:
    'Three tiers: Starter (free), Pro ($29/mo), Studio ($99/mo). Autonomous editing, Style DNA, cloud rendering.',
};

async function getCurrentTier(): Promise<{
  tier: SubscriptionTier | undefined;
  signedIn: boolean;
}> {
  if (!isSupabaseConfigured()) return { tier: undefined, signedIn: false };
  const user = await getUser();
  if (!user) return { tier: undefined, signedIn: false };
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    return {
      tier: (data?.subscription_tier as SubscriptionTier) ?? 'free',
      signedIn: true,
    };
  } catch {
    return { tier: undefined, signedIn: true };
  }
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const { tier, signedIn } = await getCurrentTier();
  const cancelled = searchParams.checkout === 'cancelled';

  return (
    <div className="min-h-screen bg-a7-void text-a7-text">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 10%, rgba(45,212,191,0.06) 0%, transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(184,115,51,0.05) 0%, transparent 55%)',
        }}
      />

      <nav
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{
          background: 'rgba(10,10,10,0.7)',
          borderBottom: '1px solid rgba(245,240,232,0.04)',
        }}
      >
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-a7-teal/15 to-transparent" />
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 sm:px-8 py-4">
          <a href="/" className="flex items-center gap-1">
            <Logo variant="dual" size="sm" wordmark />
          </a>
          <div className="flex items-center gap-3">
            <a
              href={signedIn ? '/dashboard' : '/auth/login'}
              className="text-sm text-a7-text/60 hover:text-a7-text transition-colors px-3 py-2"
            >
              {signedIn ? 'Dashboard' : 'Sign in'}
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 px-6 sm:px-8 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-wider text-a7-text/40 mb-2 font-mono">
              Pricing
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-a7-text mb-4">
              Pick a tier. Cancel any time.
            </h1>
            <p className="text-a7-text/50 max-w-xl mx-auto">
              Every tier includes Style DNA, autonomous editing, and cloud
              rendering. You only pay for output.
            </p>
          </div>

          {cancelled && (
            <div
              className="mb-8 max-w-2xl mx-auto px-4 py-3 rounded-md text-sm text-center"
              style={{
                background:
                  'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
                border: '1px solid rgba(212,148,74,0.25)',
                color: '#E8B06A',
              }}
            >
              Checkout cancelled. No charge was made.
            </div>
          )}

          <PricingCards currentTier={tier} signedIn={signedIn} />

          <p className="text-center text-xs text-a7-text/30 mt-10">
            Need an Enterprise / on-prem plan?{' '}
            <a href="mailto:hello@bonner.ai" className="text-grad-teal hover:underline">
              Talk to us
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
