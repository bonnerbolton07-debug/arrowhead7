'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui/Logo';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#use-cases', label: 'Use cases' },
  { href: '/pricing', label: 'Pricing' },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <nav
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        background: 'rgba(10,10,10,0.7)',
        borderBottom: '1px solid rgba(245,240,232,0.04)',
      }}
    >
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-a7-teal/15 to-transparent" />
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 sm:px-8 py-4">
        <Link href="/" className="flex items-center gap-1">
          <Logo variant="dual" size="sm" wordmark />
        </Link>

        <div className="hidden md:flex items-center gap-7 text-sm">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-a7-text/50 hover:text-a7-text transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="hidden sm:inline text-sm text-a7-text/60 hover:text-a7-text transition-colors px-3 py-2"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="hidden sm:inline-block text-sm px-4 py-2 rounded-md font-medium transition-all text-a7-void"
            style={{
              background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              boxShadow: '0 0 20px rgba(45,212,191,0.25)',
            }}
          >
            Get Started
          </Link>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-a7-text/70 hover:text-a7-text"
            style={{
              background: 'rgba(245,240,232,0.04)',
              border: '1px solid rgba(245,240,232,0.08)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <line x1="3" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(8,8,8,0.96)', backdropFilter: 'blur(12px)' }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid rgba(245,240,232,0.04)' }}
          >
            <Logo variant="dual" size="sm" wordmark />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="inline-flex items-center justify-center w-10 h-10 rounded-md text-a7-text/70 hover:text-a7-text"
              style={{
                background: 'rgba(245,240,232,0.04)',
                border: '1px solid rgba(245,240,232,0.08)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1 px-6 py-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-lg py-3 text-a7-text/80 hover:text-a7-text transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="h-px my-4" style={{ background: 'rgba(245,240,232,0.06)' }} />
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="text-lg py-3 text-a7-text/70 hover:text-a7-text transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              onClick={() => setOpen(false)}
              className="mt-3 text-center text-sm px-4 py-3 rounded-md font-medium transition-all text-a7-void"
              style={{
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: '0 0 20px rgba(45,212,191,0.25)',
              }}
            >
              Get Started
            </Link>
          </nav>
        </div>
      )}
    </nav>
  );
}
