import { DashboardShell } from '@/components/ui/DashboardShell';
import { getUser, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const user = await getUser();
  const supabaseReady = isSupabaseConfigured();

  return (
    <DashboardShell activeHref="/dashboard">
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
          <a
            href="/editor"
            className="relative overflow-hidden rounded-lg p-6 transition-all group hover:scale-[1.01]"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(45,212,191,0.01))',
              border: '1px solid rgba(45,212,191,0.08)',
              boxShadow: '0 0 15px rgba(45,212,191,0.05)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.25), transparent)' }}
            />
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
          <a
            href="/dashboard/styles"
            className="relative overflow-hidden rounded-lg p-6 transition-all group hover:scale-[1.01]"
            style={{
              background: 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))',
              border: '1px solid rgba(184,115,51,0.08)',
              boxShadow: '0 0 15px rgba(184,115,51,0.05)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(184,115,51,0.25), transparent)' }}
            />
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
        <div
          className="relative overflow-hidden rounded-lg p-12 text-center"
          style={{
            background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
            border: '1px solid rgba(245,240,232,0.04)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.1), rgba(184,115,51,0.08), transparent)' }}
          />
          <p className="text-a7-text/30 text-sm">No edits yet. Create your first one above.</p>
        </div>
      </div>
    </DashboardShell>
  );
}
