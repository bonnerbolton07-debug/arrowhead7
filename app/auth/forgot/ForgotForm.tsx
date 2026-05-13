'use client';

import { useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function ForgotForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isSupabaseConfigured()) {
      setFormError(
        'Password reset is temporarily unavailable. Please try again shortly.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/login?message=Password+reset.+Please+sign+in.`,
      });
      if (error) {
        setFormError(error.message);
        setSubmitting(false);
        return;
      }
      setSent(true);
      setSubmitting(false);
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
        <h1 className="text-2xl font-bold mb-1 text-a7-text">Reset password</h1>
        <p className="text-sm text-a7-text/40 mb-8">
          Enter your account email. We&rsquo;ll send a reset link.
        </p>
        {sent ? (
          <div
            className="px-4 py-3 rounded-md text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
              border: '1px solid rgba(45,212,191,0.2)',
              color: '#5BE8D5',
            }}
          >
            If an account exists for {email}, a reset link is on the way.
          </div>
        ) : (
          <>
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
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-3 rounded-md font-semibold text-sm text-a7-void transition-all disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                  boxShadow: '0 0 20px rgba(45,212,191,0.25)',
                }}
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <div className="mt-6 text-center text-sm text-a7-text/40">
          <a href="/auth/login" className="text-grad-teal font-medium hover:underline">
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
