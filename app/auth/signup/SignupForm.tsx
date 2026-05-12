'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ confirmRequired: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }
    if (!isSupabaseConfigured()) {
      setFormError(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/api/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        setFormError(error.message);
        setSubmitting(false);
        return;
      }
      // If email confirmation is OFF, session exists -> straight to dashboard.
      // If email confirmation is ON, session is null -> show confirm message.
      if (data.session) {
        router.push('/dashboard');
        router.refresh();
        return;
      }
      setDone({ confirmRequired: true });
      setSubmitting(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  if (done?.confirmRequired) {
    return (
      <div className="w-full max-w-md">
        <div
          className="relative overflow-hidden rounded-xl p-8 text-center"
          style={{
            background: 'linear-gradient(180deg, rgba(16,16,14,0.95), rgba(10,10,10,0.95))',
            border: '1px solid rgba(245,240,232,0.06)',
            boxShadow: '0 0 30px rgba(45,212,191,0.06)',
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(45,212,191,0.4), rgba(184,115,51,0.3), transparent)',
            }}
          />
          <svg viewBox="0 0 24 24" width="56" height="56" className="mx-auto mb-4">
            <defs>
              <linearGradient id="mail-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1a9e8f" />
                <stop offset="100%" stopColor="#5BE8D5" />
              </linearGradient>
            </defs>
            <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="url(#mail-grad)" strokeWidth="1.8" />
            <path d="M3 7l9 6 9-6" fill="none" stroke="url(#mail-grad)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <h1 className="text-xl font-bold mb-2 text-a7-text">Check your inbox</h1>
          <p className="text-sm text-a7-text/50 mb-6">
            We sent a confirmation link to <span className="text-a7-text/80">{email}</span>. Click it to
            activate your account.
          </p>
          <a
            href="/auth/login"
            className="inline-block px-5 py-2.5 rounded-md font-medium text-sm transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.1), rgba(45,212,191,0.03))',
              border: '1px solid rgba(45,212,191,0.2)',
              color: '#5BE8D5',
            }}
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div
        className="relative overflow-hidden rounded-xl p-8"
        style={{
          background: 'linear-gradient(180deg, rgba(16,16,14,0.95), rgba(10,10,10,0.95))',
          border: '1px solid rgba(245,240,232,0.06)',
          boxShadow: '0 0 30px rgba(184,115,51,0.06), 0 0 60px rgba(45,212,191,0.04)',
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(184,115,51,0.4), rgba(45,212,191,0.3), transparent)',
          }}
        />

        <h1 className="text-2xl font-bold mb-1 text-a7-text">Create your account</h1>
        <p className="text-sm text-a7-text/40 mb-8">
          Free tier: 3 edits, full Style DNA, watermarked export.
        </p>

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
            <label htmlFor="password" className="block text-xs font-medium text-a7-text/60 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-md text-sm text-a7-text placeholder-a7-text/20 focus:outline-none transition-all"
              style={{
                background: 'linear-gradient(180deg, rgba(26,25,24,0.6), rgba(16,16,14,0.6))',
                border: '1px solid rgba(245,240,232,0.08)',
              }}
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-xs font-medium text-a7-text/60 mb-2">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
              background: 'linear-gradient(135deg, #8B5A2B, #B87333)',
              boxShadow: '0 0 20px rgba(184,115,51,0.25)',
            }}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-a7-text/40">
          Already have an account?{' '}
          <a href="/auth/login" className="text-grad-teal font-medium hover:underline">
            Sign in
          </a>
        </div>

        <p className="mt-6 text-xs text-a7-text/20 text-center">
          By creating an account you agree to our Terms and acknowledge our Privacy Policy.
        </p>
      </div>
    </div>
  );
}
