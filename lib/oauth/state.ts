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
import { decryptToken, encryptToken } from '@/lib/crypto/tokens';

const STATE_COOKIE_PREFIX = 'a7_oauth_state__';
const PKCE_COOKIE_PREFIX = 'a7_oauth_pkce__';
const NEXT_COOKIE_PREFIX = 'a7_oauth_next__';
const REDIRECT_COOKIE_PREFIX = 'a7_oauth_redirect__';
const USER_COOKIE_PREFIX = 'a7_oauth_user__';
const MAX_AGE_SECONDS = 600;
const STATE_TOKEN_PREFIX = 'a7v1.';

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

export interface OAuthStatePayload {
  userId: string;
  nextPath: string;
  redirectUri: string | null;
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

function signingSecret(): string {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secret) {
    throw new Error('OAuth state signing secret not configured');
  }
  return secret;
}

function signUserId(userId: string): string {
  const sig = crypto
    .createHmac('sha256', signingSecret())
    .update(userId)
    .digest('base64url');
  return `${userId}.${sig}`;
}

function verifySignedUserId(value: string | undefined): string | null {
  if (!value) return null;
  const splitAt = value.lastIndexOf('.');
  if (splitAt <= 0) return null;

  const userId = value.slice(0, splitAt);
  const received = value.slice(splitAt + 1);
  const expected = signUserId(userId).slice(splitAt + 1);

  try {
    const receivedBuf = Buffer.from(received);
    const expectedBuf = Buffer.from(expected);
    if (receivedBuf.length !== expectedBuf.length) return null;
    return crypto.timingSafeEqual(receivedBuf, expectedBuf) ? userId : null;
  } catch {
    return null;
  }
}

export function createOAuthState(
  provider: string,
  userId: string,
  nextPath?: string,
  redirectUri?: string
): string {
  const payload = {
    p: provider,
    u: userId,
    n: nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard/channels',
    r: redirectUri && /^https?:\/\//i.test(redirectUri) ? redirectUri : null,
    e: Date.now() + MAX_AGE_SECONDS * 1000,
  };
  const encrypted = encryptToken(JSON.stringify(payload));
  return `${STATE_TOKEN_PREFIX}${Buffer.from(encrypted, 'utf8').toString('base64url')}`;
}

export function readOAuthState(
  provider: string,
  state: string | null
): OAuthStatePayload | null {
  if (!state?.startsWith(STATE_TOKEN_PREFIX)) return null;
  try {
    const encrypted = Buffer.from(
      state.slice(STATE_TOKEN_PREFIX.length),
      'base64url'
    ).toString('utf8');
    const payload = JSON.parse(decryptToken(encrypted)) as {
      p?: unknown;
      u?: unknown;
      n?: unknown;
      r?: unknown;
      e?: unknown;
    };

    if (payload.p !== provider) return null;
    if (typeof payload.u !== 'string' || !payload.u) return null;
    if (typeof payload.e !== 'number' || payload.e < Date.now()) return null;

    const nextPath =
      typeof payload.n === 'string' && payload.n.startsWith('/')
        ? payload.n
        : '/dashboard/channels';
    const redirectUri =
      typeof payload.r === 'string' && /^https?:\/\//i.test(payload.r)
        ? payload.r
        : null;

    return { userId: payload.u, nextPath, redirectUri };
  } catch {
    return null;
  }
}

export async function setStateCookie(
  provider: string,
  state: string,
  nextPath?: string,
  redirectUri?: string,
  userId?: string
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
  if (userId) {
    jar.set(USER_COOKIE_PREFIX + provider, signUserId(userId), cookieOpts());
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
  userId: string | null;
}> {
  const jar = await cookies();
  const state = jar.get(STATE_COOKIE_PREFIX + provider)?.value ?? null;
  const verifier = jar.get(PKCE_COOKIE_PREFIX + provider)?.value ?? null;
  const nextRaw = jar.get(NEXT_COOKIE_PREFIX + provider)?.value;
  const redirectUri = jar.get(REDIRECT_COOKIE_PREFIX + provider)?.value ?? null;
  const userId = verifySignedUserId(jar.get(USER_COOKIE_PREFIX + provider)?.value);
  const nextPath =
    nextRaw && nextRaw.startsWith('/') ? nextRaw : '/dashboard/channels';

  // Clear cookies (set to empty with maxAge=0).
  jar.set(STATE_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(PKCE_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(NEXT_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(REDIRECT_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(USER_COOKIE_PREFIX + provider, '', cookieOpts(0));

  return { state, verifier, nextPath, redirectUri, userId };
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
