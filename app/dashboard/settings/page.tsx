import { DashboardShell, ComingSoon } from '@/components/ui/DashboardShell';
import { getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Settings — Arrowhead 7' };

export default async function SettingsPage() {
  const user = await getUser();

  return (
    <DashboardShell activeHref="/dashboard/settings">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-2 text-a7-text">Settings</h1>
        <p className="text-a7-text/50 text-sm mb-8">Manage your account, billing, and defaults.</p>

        <section
          className="relative overflow-hidden rounded-xl p-6 mb-5"
          style={{
            background: 'linear-gradient(180deg, rgba(16,16,14,0.95), rgba(10,10,10,0.95))',
            border: '1px solid rgba(245,240,232,0.06)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)' }}
          />
          <div className="text-xs font-mono uppercase tracking-wider text-grad-teal mb-3">
            Account
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-a7-text/50">Email</span>
              <span className="text-a7-text/90 font-mono text-xs">
                {user?.email ?? 'Not signed in'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-a7-text/50">Plan</span>
              <span className="text-grad-copper font-medium">Free</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-a7-text/50">Credits remaining</span>
              <span className="text-a7-text/90">3</span>
            </div>
          </div>
          {user && (
            <a
              href="/api/auth/signout"
              className="inline-flex items-center gap-2 mt-5 text-sm text-a7-text/50 hover:text-a7-text transition-colors"
            >
              Sign out
            </a>
          )}
        </section>

        <ComingSoon
          title="Billing &amp; Defaults"
          blurb="Subscription management, render defaults, and notification preferences."
          accent="copper"
          bullets={[
            'Upgrade / downgrade Stripe subscription',
            'Default render resolution and format',
            'Email notifications for completed renders',
            'API keys for programmatic access (Pro tier)',
          ]}
        />
      </div>
    </DashboardShell>
  );
}
