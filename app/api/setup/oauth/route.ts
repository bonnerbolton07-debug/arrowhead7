// =============================================================================
// Arrowhead 7 — OAuth setup inspector
// =============================================================================
// GET returns the exact redirect URIs the app will send to each provider,
// plus which provider env vars are missing. Surfaced on the Vault and
// Channels pages so users can copy the URIs directly into their provider
// developer consoles instead of guessing.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { getRedirectUri } from '@/lib/oauth/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = [
  {
    slug: 'google-drive',
    label: 'Google Drive',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    console: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    slug: 'youtube',
    label: 'YouTube',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    console: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    slug: 'dropbox',
    label: 'Dropbox',
    envVars: ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET'],
    console: 'https://www.dropbox.com/developers/apps',
  },
  {
    slug: 'instagram',
    label: 'Instagram',
    envVars: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
    console: 'https://developers.facebook.com/apps/',
  },
  {
    slug: 'tiktok',
    label: 'TikTok',
    envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    console: 'https://developers.tiktok.com/apps',
  },
  {
    slug: 'x',
    label: 'X (Twitter)',
    envVars: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    console: 'https://developer.twitter.com/en/portal/dashboard',
  },
] as const;

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const envBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? null;
  const requestOrigin = request.nextUrl.origin;

  const providers = PROVIDERS.map((p) => {
    const missing = p.envVars.filter((v) => !process.env[v]);
    return {
      slug: p.slug,
      label: p.label,
      configured: missing.length === 0,
      missingEnv: missing,
      redirectUri: getRedirectUri(p.slug, request),
      consoleUrl: p.console,
    };
  });

  return NextResponse.json({
    appUrl: envBase,
    requestOrigin,
    appUrlSet: envBase !== null,
    providers,
    notes:
      envBase === null
        ? 'NEXT_PUBLIC_APP_URL is not set. Each connector is using the current request origin as a fallback — set NEXT_PUBLIC_APP_URL on Vercel to your canonical production domain (e.g. https://arrowhead7.ai) so the redirect_uri stays stable across deploys.'
        : null,
  });
}
