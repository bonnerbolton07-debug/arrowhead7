// =============================================================================
// Arrowhead 7 — OAuth Connector Diagnostic (public, no auth)
// =============================================================================
// Sister of /api/setup/oauth, but unauthenticated. The setup endpoint requires
// a logged-in user, which is unhelpful when you're trying to debug a redirect
// URI mismatch that prevents login in the first place. This route is safe to
// expose: it only reports the redirect URIs we'd send (derived from
// NEXT_PUBLIC_APP_URL or the request origin) and which env vars are present
// (boolean only — never the values).
//
// Usage:
//   curl https://arrowhead7.ai/api/auth/diagnostic | jq

import { NextRequest, NextResponse } from 'next/server';
import { getRedirectUri } from '@/lib/oauth/state';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = [
  { slug: 'google-drive', envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { slug: 'youtube', envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { slug: 'dropbox', envVars: ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET'] },
  { slug: 'instagram', envVars: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'] },
  { slug: 'tiktok', envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'] },
  { slug: 'x', envVars: ['X_CLIENT_ID', 'X_CLIENT_SECRET'] },
] as const;

export async function GET(request: NextRequest) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_PUBLIC_AUTH_DIAGNOSTIC !== 'true'
  ) {
    try {
      await requireUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const envBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? null;
  const requestOrigin = request.nextUrl.origin;

  return NextResponse.json({
    appUrl: envBase ?? requestOrigin,
    appUrlSource: envBase
      ? 'env(NEXT_PUBLIC_APP_URL)'
      : 'fallback(request.origin)',
    note:
      'Each redirectUri below MUST be registered verbatim in the matching ' +
      'provider developer console. iCloud Drive uses a share-link flow and ' +
      "doesn't appear here — see CONNECTORS_SETUP.md.",
    providers: PROVIDERS.map((p) => ({
      slug: p.slug,
      redirectUri: getRedirectUri(p.slug, request),
      env: p.envVars.map((k) => ({ key: k, present: Boolean(process.env[k]) })),
      configured: p.envVars.every((k) => Boolean(process.env[k])),
    })),
  });
}
