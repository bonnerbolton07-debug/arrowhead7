'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import {
  GridIcon,
  FilmIcon,
  DnaIcon,
  TrendIcon,
  VaultIcon,
  ShareIcon,
  SettingsIcon,
} from '@/components/ui/icons';
import type { SubscriptionTier } from '@/types';
import { TIER_DISPLAY } from '@/types';

type NavItem = {
  label: string;
  href: string;
  Icon: typeof GridIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', Icon: GridIcon },
  { label: 'My Edits', href: '/dashboard/edits', Icon: FilmIcon },
  { label: 'Style DNA', href: '/dashboard/styles', Icon: DnaIcon },
  { label: 'Strategy', href: '/dashboard/strategy', Icon: TrendIcon },
  { label: 'Smart Vault', href: '/vault', Icon: VaultIcon },
  { label: 'Channels', href: '/dashboard/channels', Icon: ShareIcon },
  { label: 'Settings', href: '/dashboard/settings', Icon: SettingsIcon },
];

interface SidebarProps {
  userEmail: string | null;
  tier: SubscriptionTier;
  creditsRemaining: number;
  creditsTotal: number; // -1 for unlimited
}

export function Sidebar({
  userEmail,
  tier,
  creditsRemaining,
  creditsTotal,
}: SidebarProps) {
  const pathname = usePathname() ?? '';
  const display = TIER_DISPLAY[tier];

  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 p-6 flex-col border-r border-a7-text/[0.04]"
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

      <nav className="space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all relative overflow-hidden ${
                active ? 'font-medium' : 'text-a7-text/40 hover:text-a7-text'
              }`}
              style={
                active
                  ? {
                      background:
                        'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                      border: '1px solid rgba(45,212,191,0.1)',
                      boxShadow: '0 0 12px rgba(45,212,191,0.06)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              {active && (
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(45,212,191,0.3), transparent)',
                  }}
                />
              )}
              <item.Icon size={16} gradient={active ? 'teal' : 'teal'} />
              <span className={active ? 'text-grad-teal' : ''}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3">
        <Link
          href="/dashboard/settings"
          className="block rounded-lg p-4 relative overflow-hidden transition-all hover:scale-[1.01]"
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
          <div className="text-[10px] uppercase tracking-wider text-a7-text/30 mb-1 font-mono">
            {display.name} plan
          </div>
          <div className="text-2xl font-bold text-grad-copper leading-none">
            {creditsTotal === -1
              ? '∞'
              : creditsRemaining}
          </div>
          <div className="text-xs text-a7-text/20 mt-1">
            {creditsTotal === -1
              ? 'Unlimited edits'
              : `of ${creditsTotal} edits remaining`}
          </div>
          {tier === 'free' && (
            <div className="mt-3 inline-block text-[10px] px-2 py-0.5 rounded-full text-grad-teal" style={{ background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.15)' }}>
              Upgrade →
            </div>
          )}
        </Link>

        {userEmail && (
          <div className="space-y-2">
            <div className="text-[10px] text-a7-text/30 truncate font-mono">{userEmail}</div>
            <a
              href="/api/auth/signout"
              className="block w-full text-center px-3 py-2 rounded-md text-xs text-a7-text/40 hover:text-a7-text transition-colors border border-a7-text/[0.06]"
            >
              Sign out
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}

export function MobileNavStrip() {
  const pathname = usePathname() ?? '';
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-2 py-2 flex justify-around border-t border-a7-text/[0.06]"
      style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(8px)' }}
    >
      {NAV_ITEMS.slice(0, 5).map((item) => {
        const active =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <a
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-all"
          >
            <item.Icon size={20} gradient={active ? 'teal' : 'teal'} />
            <span
              className={`text-[10px] ${
                active ? 'text-grad-teal' : 'text-a7-text/40'
              }`}
            >
              {item.label.replace('My ', '')}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
