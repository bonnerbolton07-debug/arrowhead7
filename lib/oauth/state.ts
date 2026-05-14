// =============================================================================
// Arrowhead 7 — OAuth State + PKCE Helpers
// =============================================================================
// CSRF protection via signed state cookies. PKCE verifier handling for X.
//
// Redirect URI handling: providers like Google require the redirect_uri at
// the token-exchange step to match the one used at the authorize step
// byte-for-byte. We persist the exact URI used at connect time in a cookie
// alongside `state`, then read it back at callback time. This makes the
// flow robust to NEXT_PUBLIC_APP_URL drift across deploys (preview vs prod,
// custom domain vs vercel.app, http vs https).

import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const STATE_COOKIE_PREFIX = 'a7_oauth_state__';
const PKCE_COOKIE_PREFIX = 'a7_oauth_pkce__';
const NEXT_COOKIE_PREFIX = 'a7_oauth_next__';
const REDIRECT_COOKIE_PREFIX = 'a7_oauth_redirect__';
const MAX_AGE_SECONDS = 600;

function cookieOpts(maxAge = MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

export async function setStateCookie(
  provider: string,
  state: string,
  nextPath?: string,
  redirectUri?: string
): Promise<void> {
  const jar = await cookies();
  jar.set(STATE_COOKIE_PREFIX + provider, state, cookieOpts());
  if (nextPath && nextPath.startsWith('/')) {
    jar.set(NEXT_COOKIE_PREFIX + provider, nextPath, cookieOpts());
  }
  if (redirectUri && /^https?:\/\//i.test(redirectUri)) {
    // Persist the exact redirect URI we asked the provider to call back to,
    // so the callback step uses the same string when exchanging the code.
    jar.set(REDIRECT_COOKIE_PREFIX + provider, redirectUri, cookieOpts());
  }
}

export async function setPkceCookie(
  provider: string,
  verifier: string
): Promise<void> {
  const jar = await cookies();
  jar.set(PKCE_COOKIE_PREFIX + provider, verifier, cookieOpts());
}

export async function readAndClearState(provider: string): Promise<{
  state: string | null;
  verifier: string | null;
  nextPath: string;
  redirectUri: string | null;
}> {
  const jar = await cookies();
  const state = jar.get(STATE_COOKIE_PREFIX + provider)?.value ?? null;
  const verifier = jar.get(PKCE_COOKIE_PREFIX + provider)?.value ?? null;
  const nextRaw = jar.get(NEXT_COOKIE_PREFIX + provider)?.value;
  const redirectUri = jar.get(REDIRECT_COOKIE_PREFIX + provider)?.value ?? null;
  const nextPath =
    nextRaw && nextRaw.startsWith('/') ? nextRaw : '/dashboard/channels';

  // Clear cookies (set to empty with maxAge=0).
  jar.set(STATE_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(PKCE_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(NEXT_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(REDIRECT_COOKIE_PREFIX + provider, '', cookieOpts(0));

  return { state, verifier, nextPath, redirectUri };
}

export function verifyState(
  expected: string | null,
  received: string | null
): boolean {
  if (!expected || !received) return false;
  if (expected.length !== received.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Build the redirect URI for an OAuth provider.
 *
 * Preference order:
 *   1. The `redirectUri` cookie persisted at connect time (callback path).
 *   2. `NEXT_PUBLIC_APP_URL` env var (canonical production deploy).
 *   3. The incoming request's origin (preview deploys, custom domains).
 *   4. Hard-coded localhost (last-ditch dev fallback).
 *
 * This matters because OAuth providers like Google require the redirect_uri
 * sent to /authorize and /token to match byte-for-byte. If env / request
 * origin disagree, persisting (1) is what makes the round-trip succeed.
 */
export function getRedirectUri(provider: string, request?: NextRequest): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (envBase) return `${envBase}/api/auth/${provider}/callback`;
  if (request) {
    // Honour reverse-proxy headers — Vercel sets x-forwarded-host /
    // x-forwarded-proto on every request, and request.nextUrl reflects them.
    const origin = request.nextUrl.origin;
    if (origin) return `${origin}/api/auth/${provider}/callback`;
  }
  return `http://localhost:3000/api/auth/${provider}/callback`;
}
