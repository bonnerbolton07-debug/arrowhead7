import { Logo } from '@/components/ui/Logo';
import { getUser } from '@/lib/supabase/server';

type NavItem = { label: string; href: string };

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'My Edits', href: '/dashboard/edits' },
  { label: 'Style DNA', href: '/dashboard/styles' },
  { label: 'Smart Vault', href: '/vault' },
  { label: 'Channels', href: '/dashboard/channels' },
  { label: 'Settings', href: '/dashboard/settings' },
];

export async function DashboardShell({
  activeHref,
  children,
}: {
  activeHref: string;
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void">
      <aside
        className="fixed left-0 top-0 bottom-0 w-64 p-6 border-r border-a7-text/[0.04] hidden md:block"
        style={{ background: 'linear-gradient(180deg, #0E0E0C, #0A0A0A)' }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.15), rgba(184,115,51,0.1), transparent)' }}
        />

        <a href="/" className="flex items-center gap-2 mb-10">
          <Logo variant="dual" size="sm" wordmark />
        </a>

        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = item.href === activeHref;
            return (
              <a
                key={item.label}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-sm transition-all relative overflow-hidden ${
                  active ? 'font-medium' : 'text-a7-text/40 hover:text-a7-text'
                }`}
                style={
                  active
                    ? {
                        background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                        border: '1px solid rgba(45,212,191,0.1)',
                        boxShadow: '0 0 12px rgba(45,212,191,0.06)',
                      }
                    : {}
                }
              >
                {active && (
                  <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)' }}
                  />
                )}
                <span className={active ? 'text-grad-teal' : ''}>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="absolute bottom-6 left-6 right-6 space-y-3">
          <div
            className="rounded-lg p-4 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.02))',
              border: '1px solid rgba(184,115,51,0.1)',
              boxShadow: '0 0 15px rgba(184,115,51,0.06)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)' }}
            />
            <div className="text-xs text-a7-text/30 mb-1">Credits Remaining</div>
            <div className="text-2xl font-bold text-grad-copper">3</div>
            <div className="text-xs text-a7-text/20 mt-1">Free Tier</div>
          </div>
          {user && (
            <a
              href="/api/auth/signout"
              className="block w-full text-center px-3 py-2 rounded-md text-xs text-a7-text/40 hover:text-a7-text transition-colors border border-a7-text/[0.06]"
            >
              Sign out
            </a>
          )}
        </div>
      </aside>

      <nav
        className="md:hidden sticky top-0 z-30 backdrop-blur-md border-b border-a7-text/[0.04]"
        style={{ background: 'rgba(10,10,10,0.85)' }}
      >
        <div className="flex items-center justify-between px-5 py-3">
          <a href="/" className="flex items-center gap-2">
            <Logo variant="dual" size="xs" wordmark />
          </a>
          {user && (
            <a
              href="/api/auth/signout"
              className="text-xs text-a7-text/50 hover:text-a7-text transition-colors"
            >
              Sign out
            </a>
          )}
        </div>
        <div className="flex overflow-x-auto gap-1 px-3 pb-3 -mt-1">
          {NAV.map((item) => {
            const active = item.href === activeHref;
            return (
              <a
                key={item.label}
                href={item.href}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-all ${
                  active
                    ? 'text-grad-teal border-a7-teal/30 bg-a7-teal/[0.04]'
                    : 'text-a7-text/50 border-a7-text/[0.06] hover:text-a7-text'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>

      <main className="md:ml-64 p-5 sm:p-8">{children}</main>
    </div>
  );
}

export function ComingSoon({
  title,
  blurb,
  bullets,
  accent = 'teal',
}: {
  title: string;
  blurb: string;
  bullets: string[];
  accent?: 'teal' | 'copper';
}) {
  const teal = accent === 'teal';
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2 text-a7-text">{title}</h1>
      <p className="text-a7-text/50 text-sm mb-8 leading-relaxed">{blurb}</p>

      <div
        className="relative overflow-hidden rounded-xl p-7"
        style={{
          background: teal
            ? 'linear-gradient(135deg, rgba(45,212,191,0.05), rgba(45,212,191,0.01))'
            : 'linear-gradient(135deg, rgba(184,115,51,0.05), rgba(184,115,51,0.01))',
          border: teal
            ? '1px solid rgba(45,212,191,0.12)'
            : '1px solid rgba(184,115,51,0.12)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: teal
              ? 'linear-gradient(90deg, rgba(45,212,191,0.4), transparent)'
              : 'linear-gradient(90deg, rgba(184,115,51,0.4), transparent)',
          }}
        />
        <div
          className={`text-xs font-mono uppercase tracking-wider mb-3 ${teal ? 'text-grad-teal' : 'text-grad-copper'}`}
        >
          Coming Soon
        </div>
        <p className="text-a7-text/80 text-sm mb-5 leading-relaxed">
          We&rsquo;re shipping this surface next. Here&rsquo;s what&rsquo;s in flight:
        </p>
        <ul className="space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-a7-text/70">
              <span
                className={`mt-1 inline-block w-1 h-1 rounded-full ${teal ? 'bg-a7-teal' : 'bg-a7-copper'}`}
              />
              {b}
            </li>
          ))}
        </ul>
      </div>

      <a
        href="/dashboard"
        className="inline-flex items-center gap-2 mt-6 text-sm text-a7-text/40 hover:text-a7-text transition-colors"
      >
        &larr; Back to Dashboard
      </a>
    </div>
  );
}
