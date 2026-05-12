// TODO: Protect with auth middleware — redirect to /auth/login if not authenticated

import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  // TODO: Fetch user's edits, credits, channels
  // const supabase = await createServerSupabaseClient();
  // const { data: edits } = await supabase.from('edits').select('*').order('created_at', { ascending: false });

  return (
    <div className="min-h-screen bg-a7-black">
      {/* Sidebar — TODO: Extract to component */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-a7-dark border-r border-a7-gray p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 bg-a7-accent rounded-sm flex items-center justify-center font-mono font-bold text-sm">
            A7
          </div>
          <span className="font-semibold tracking-tight">Arrowhead 7</span>
        </div>

        <nav className="space-y-1">
          {[
            { label: 'Dashboard', href: '/dashboard', active: true },
            { label: 'My Edits', href: '/dashboard/edits', active: false },
            { label: 'Style DNA', href: '/dashboard/styles', active: false },
            { label: 'Channels', href: '/dashboard/channels', active: false },
            { label: 'Settings', href: '/dashboard/settings', active: false },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                item.active
                  ? 'bg-a7-accent/10 text-a7-accent font-medium'
                  : 'text-a7-light/50 hover:text-a7-white hover:bg-a7-gray/50'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Credits */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="bg-a7-gray rounded-lg p-4">
            <div className="text-xs text-a7-light/40 mb-1">Credits Remaining</div>
            <div className="text-2xl font-bold text-a7-accent">3</div>
            <div className="text-xs text-a7-light/30 mt-1">Free Tier</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
          <p className="text-a7-light/50 text-sm mb-8">Welcome back. Start a new edit or continue where you left off.</p>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            <a
              href="/editor"
              className="bg-a7-dark border border-a7-gray rounded-lg p-6 hover:border-a7-accent/50 transition-colors group"
            >
              <div className="text-a7-accent text-2xl mb-3">+</div>
              <h3 className="font-semibold mb-1 group-hover:text-a7-accent transition-colors">New Edit</h3>
              <p className="text-sm text-a7-light/40">Upload footage and create a new autonomous edit</p>
            </a>
            <a
              href="/dashboard/styles"
              className="bg-a7-dark border border-a7-gray rounded-lg p-6 hover:border-a7-accent/50 transition-colors group"
            >
              <div className="text-a7-accent text-2xl mb-3">&#9670;</div>
              <h3 className="font-semibold mb-1 group-hover:text-a7-accent transition-colors">New Style DNA</h3>
              <p className="text-sm text-a7-light/40">Upload a reference video to extract its editing style</p>
            </a>
          </div>

          {/* Recent Edits — TODO: Populate from database */}
          <h2 className="text-lg font-semibold mb-4">Recent Edits</h2>
          <div className="bg-a7-dark border border-a7-gray rounded-lg p-12 text-center">
            <p className="text-a7-light/40 text-sm">No edits yet. Create your first one above.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
