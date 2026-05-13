// =============================================================================
// Arrowhead 7 — OAuth State + PKCE Helpers
// =============================================================================
// CSRF protection via signed state cookies. PKCE verifier handling for X.

import crypto from 'crypto';
import { cookies } from 'next/headers';

const STATE_COOKIE_PREFIX = 'a7_oauth_state__';
const PKCE_COOKIE_PREFIX = 'a7_oauth_pkce__';
const NEXT_COOKIE_PREFIX = 'a7_oauth_next__';
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
  nextPath?: string
): Promise<void> {
  const jar = await cookies();
  jar.set(STATE_COOKIE_PREFIX + provider, state, cookieOpts());
  if (nextPath && nextPath.startsWith('/')) {
    jar.set(NEXT_COOKIE_PREFIX + provider, nextPath, cookieOpts());
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
}> {
  const jar = await cookies();
  const state = jar.get(STATE_COOKIE_PREFIX + provider)?.value ?? null;
  const verifier = jar.get(PKCE_COOKIE_PREFIX + provider)?.value ?? null;
  const nextRaw = jar.get(NEXT_COOKIE_PREFIX + provider)?.value;
  const nextPath =
    nextRaw && nextRaw.startsWith('/') ? nextRaw : '/dashboard/channels';

  // Clear cookies (set to empty with maxAge=0).
  jar.set(STATE_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(PKCE_COOKIE_PREFIX + provider, '', cookieOpts(0));
  jar.set(NEXT_COOKIE_PREFIX + provider, '', cookieOpts(0));

  return { state, verifier, nextPath };
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

export function getRedirectUri(provider: string): string {
  return `${getAppUrl()}/api/auth/${provider}/callback`;
}
