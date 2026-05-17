// =============================================================================
// Arrowhead 7 — Dashboard Sidebar
// =============================================================================
// Shared between every /dashboard/* page. Renders the navigation, credits
// meter, and sign-out button. Highlight derived from the active route.

import { Logo } from './Logo';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

interface DashboardSidebarProps {
  active:
    | 'home'
    | 'edits'
    | 'styles'
    | 'strategy'
    | 'vault'
    | 'channels'
    | 'settings';
  user: User | null;
  credits?: number;
  tierLabel?: string;
}

const NAV_ITEMS: {
  key: DashboardSidebarProps['active'];
  label: string;
  href: string;
}[] = [
  { key: 'home',     label: 'Dashboard',     href: '/dashboard' },
  { key: 'edits',    label: 'My Edits',      href: '/dashboard/edits' },
  { key: 'styles',   label: 'Style DNA',     href: '/dashboard/styles' },
  { key: 'strategy', label: 'Strategy Brain', href: '/dashboard/strategy' },
  { key: 'vault',    label: 'Smart Vault',   href: '/vault' },
  { key: 'channels', label: 'Channels',      href: '/dashboard/channels' },
  { key: 'settings', label: 'Settings',      href: '/dashboard/settings' },
];

export function DashboardSidebar({
  active,
  user,
  credits = 3,
  tierLabel = 'Free Tier',
}: DashboardSidebarProps) {
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-64 p-6 border-r border-a7-text/[0.04] hidden md:block"
      style={{ background: 'linear-gradient(180deg, #0E0E0C, #0A0A0A)' }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, rgba(45,212,191,0.15), rgba(184,115,51,0.1), transparent)',
        }}
      />

      <Link href="/" className="flex items-center gap-2 mb-10">
        <Logo variant="dual" size="sm" wordmark />
      </Link>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition-all relative overflow-hidden ${
                isActive ? 'font-medium' : 'text-a7-text/40 hover:text-a7-text'
              }`}
              style={
                isActive
                  ? {
                      background:
                        'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                      border: '1px solid rgba(45,212,191,0.1)',
                      boxShadow: '0 0 12px rgba(45,212,191,0.06)',
                    }
                  : {}
              }
            >
              {isActive && (
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)',
                  }}
                />
              )}
              <span className={isActive ? 'text-grad-teal' : ''}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-6 left-6 right-6 space-y-3">
        <div
          className="rounded-lg p-4 relative overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, rgba(184,115,51,0.06), rgba(184,115,51,0.02))',
            border: '1px solid rgba(184,115,51,0.1)',
            boxShadow: '0 0 15px rgba(184,115,51,0.06)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, rgba(184,115,51,0.3), transparent)',
            }}
          />
          <div className="text-xs text-a7-text/30 mb-1">Credits Remaining</div>
          <div className="text-2xl font-bold text-grad-copper">{credits}</div>
          <div className="text-xs text-a7-text/20 mt-1">{tierLabel}</div>
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
  );
}
