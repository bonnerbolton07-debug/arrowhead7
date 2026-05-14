// =============================================================================
// Arrowhead 7 — Supabase Auth Callback
// =============================================================================
// Handles email confirmation links and OAuth redirects.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Default new-confirmation links to /onboarding; the middleware will
  // forward existing users on to /dashboard if they've already finished.
  const nextParam = searchParams.get('next') ?? '/onboarding';
  const next = nextParam.startsWith('/') ? nextParam : '/onboarding';

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
