// =============================================================================
// Arrowhead 7 — Supabase Auth Middleware
// =============================================================================
// Refreshes auth tokens on every request, gates protected routes, and bounces
// already-authed users out of the auth pages.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/editor', '/vault', '/onboarding'];
const AUTH_PREFIXES = ['/auth/login', '/auth/signup', '/auth/forgot'];

// Routes a freshly-signed-up user can hit without finishing onboarding.
// Everything else under /dashboard, /editor, /vault redirects to /onboarding
// until they complete the guided flow.
const ONBOARDING_ALLOWED_PREFIXES = [
  '/onboarding',
  '/api',          // API endpoints are authorized internally
  '/auth',         // sign-in / sign-out still need to work
  '/_next',
  '/pricing',      // they can still upgrade mid-flow
];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
function isProtected(pathname: string) {
  return startsWithAny(pathname, PROTECTED_PREFIXES);
}
function isAuthRoute(pathname: string) {
  return startsWithAny(pathname, AUTH_PREFIXES);
}
function needsOnboardingGate(pathname: string) {
  if (startsWithAny(pathname, ONBOARDING_ALLOWED_PREFIXES)) return false;
  return startsWithAny(pathname, ['/dashboard', '/editor', '/vault']);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const { pathname, search } = request.nextUrl;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase, never block — let pages render so the user sees the
  // configuration error in-app instead of getting redirected in a loop.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Bounce signed-in users away from login/signup
  if (user && isAuthRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Gate protected routes
  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.search = `?error=unauthorized&next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Send first-time users into the guided onboarding before they can land on
  // the dashboard/editor/vault. We fetch their onboarding flag lazily — only
  // when the route would otherwise be gated by it — so unrelated pages don't
  // pay the round-trip.
  if (user && needsOnboardingGate(pathname)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profile && !profile.onboarding_completed_at) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
