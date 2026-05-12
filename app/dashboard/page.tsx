import { Logo, LogoIcon } from '@/components/ui/Logo';
import { getUser, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const user = await getUser();
  const supabaseReady = isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 p-6 border-r border-a7-text/[0.04]"
        style={{ background: 'linear-gradient(180deg, #0E0E0C, #0A0A0A)' }}>
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.15), rgba(184,115,51,0.1), transparent)' }} />

        <a href="/" className="flex items-center gap-2 mb-10">
          <Logo variant="dual" size="sm" wordmark />
        </a>

        <nav className="space-y-1">
          {[
            { label: 'Dashboard', href: '/dashboard', active: true },
            { label: 'My Edits', href: '/dashboard/edits', active: false },
            { label: 'Style DNA', href: '/dashboard/styles', active: false },
            { label: 'Smart Vault', href: '/vault', active: false },
            { label: 'Channels', href: '/dashboard/channels', active: false },
            { label: 'Settings', href: '/dashboard/settings', active: false },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition-all relative overflow-hidden ${
                item.active ? 'font-medium' : 'text-a7-text/40 hover:text-a7-text'
              }`}
              style={item.active ? {
                background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                border: '1px solid rgba(45,212,191,0.1)',
                boxShadow: '0 0 12px rgba(45,212,191,0.06)',
              } : {}}
            >
              {item.active && (
                <div className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)' }} />
              )}
              <span className={item.active ? 'text-grad-teal' : ''}>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="absolute bottom-6 left-6 right-6 space-y-3">
          <div className="rounded-lg p-4 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.02))',
              border: '1px solid rgba(184,115,51,0.1)',
              boxShadow: '0 0 15px rgba(184,115,51,0.06)',
            }}>
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)' }} />
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

      <main className="ml-64 p-8">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold mb-2 text-a7-text">Dashboard</h1>
          <p className="text-a7-text/40 text-sm mb-8">
            {user
              ? `Welcome back, ${user.email ?? 'creator'}. Start a new edit or continue where you left off.`
              : 'Welcome. Start a new edit or continue where you left off.'}
          </p>

          {!supabaseReady && (
            <div
              className="mb-8 px-4 py-3 rounded-md text-sm"
              style={{
                background: 'linear-gradient(135deg, rgba(212,148,74,0.08), rgba(212,148,74,0.02))',
                border: '1px solid rgba(212,148,74,0.25)',
                color: '#E8B06A',
              }}
            >
              Supabase is not configured yet. Sign-in, history, and rendering won&rsquo;t persist
              until <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are set in Vercel.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            <a href="/editor"
              className="relative overflow-hidden rounded-lg p-6 transition-all group hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))',
                border: '1px solid rgba(45,212,191,0.08)',
                boxShadow: '0 0 15px rgba(45,212,191,0.05)',
              }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)' }} />
              <svg viewBox="0 0 24 24" width="28" height="28" className="mb-3">
                <defs>
                  <linearGradient id="plus-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1a9e8f" />
                    <stop offset="100%" stopColor="#5BE8D5" />
                  </linearGradient>
                </defs>
                <line x1="12" y1="4" x2="12" y2="20" stroke="url(#plus-grad)" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="4" y1="12" x2="20" y2="12" stroke="url(#plus-grad)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <h3 className="font-semibold mb-1 text-a7-text group-hover:text-grad-teal transition-all">New Edit</h3>
              <p className="text-sm text-a7-text/30">Upload footage and create a new autonomous edit</p>
            </a>
            <a href="/dashboard/styles"
              className="relative overflow-hidden rounded-lg p-6 transition-all group hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))',
                border: '1px solid rgba(184,115,51,0.08)',
                boxShadow: '0 0 15px rgba(184,115,51,0.05)',
              }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(184,115,51,0.25), transparent)' }} />
              <svg viewBox="0 0 24 24" width="28" height="28" className="mb-3">
                <defs>
                  <linearGradient id="dna-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8B5A2B" />
                    <stop offset="100%" stopColor="#D4944A" />
                  </linearGradient>
                </defs>
                <polygon points="12,2 22,12 12,22 2,12" fill="none" stroke="url(#dna-grad)" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" fill="url(#dna-grad)" />
              </svg>
              <h3 className="font-semibold mb-1 text-a7-text group-hover:text-grad-copper transition-all">New Style DNA</h3>
              <p className="text-sm text-a7-text/30">Upload a reference video to extract its editing style</p>
            </a>
          </div>

          <h2 className="text-lg font-semibold mb-4 text-a7-text">Recent Edits</h2>
          <div className="relative overflow-hidden rounded-lg p-12 text-center"
            style={{
              background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
              border: '1px solid rgba(245,240,232,0.04)',
            }}>
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.1), rgba(184,115,51,0.08), transparent)' }} />
            <p className="text-a7-text/30 text-sm">No edits yet. Create your first one above.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
