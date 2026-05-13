'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

const errorMap: Record<string, string> = {
  auth_failed: 'Authentication failed. Please try again.',
  expired: 'Your link has expired. Please sign in again.',
  unauthorized: 'You need to sign in to view that page.',
};

export default function LoginForm({
  error,
  message,
  next,
}: {
  error?: string;
  message?: string;
  next?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(error ? errorMap[error] || error : null);
  const [info, setInfo] = useState<string | null>(message ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setInfo(null);

    if (!isSupabaseConfigured()) {
      setFormError(
        'Sign-in is temporarily unavailable. Please try again shortly.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setFormError(error.message);
        setSubmitting(false);
        return;
      }
      const target =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : '/dashboard';
      router.push(target);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div
        className="relative overflow-hidden rounded-xl p-8"
        style={{
          background: 'linear-gradient(180deg, rgba(16,16,14,0.95), rgba(10,10,10,0.95))',
          border: '1px solid rgba(245,240,232,0.06)',
          boxShadow: '0 0 30px rgba(45,212,191,0.06), 0 0 60px rgba(184,115,51,0.04)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(45,212,191,0.4), rgba(184,115,51,0.3), transparent)',
          }}
        />

        <h1 className="text-2xl font-bold mb-1 text-a7-text">Welcome back</h1>
        <p className="text-sm text-a7-text/40 mb-8">Sign in to continue editing.</p>

        {info && (
          <div
            className="mb-4 px-4 py-3 rounded-md text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
              border: '1px solid rgba(45,212,191,0.2)',
              color: '#5BE8D5',
            }}
          >
            {info}
          </div>
        )}

        {formError && (
          <div
            className="mb-4 px-4 py-3 rounded-md text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#FCA5A5',
            }}
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-a7-text/60 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-md text-sm text-a7-text placeholder-a7-text/20 focus:outline-none transition-all"
              style={{
                background: 'linear-gradient(180deg, rgba(26,25,24,0.6), rgba(16,16,14,0.6))',
                border: '1px solid rgba(245,240,232,0.08)',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="block text-xs font-medium text-a7-text/60">
                Password
              </label>
              <a href="/auth/forgot" className="text-xs text-grad-teal hover:underline">
                Forgot?
              </a>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-md text-sm text-a7-text placeholder-a7-text/20 focus:outline-none transition-all"
              style={{
                background: 'linear-gradient(180deg, rgba(26,25,24,0.6), rgba(16,16,14,0.6))',
                border: '1px solid rgba(245,240,232,0.08)',
              }}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 rounded-md font-semibold text-sm text-a7-void transition-all disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
              boxShadow: '0 0 20px rgba(45,212,191,0.25)',
            }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-a7-text/40">
          New to Arrowhead 7?{' '}
          <a href="/auth/signup" className="text-grad-copper font-medium hover:underline">
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
}
