// =============================================================================
// Arrowhead 7 — Google Drive: OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
} from '@/lib/cloud/google-drive';
import { getRedirectUri, readAndClearState, verifyState } from '@/lib/oauth/state';
import { upsertCloudConnection } from '@/lib/oauth/store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const receivedState = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const { state: expectedState, nextPath, redirectUri: storedRedirect } =
    await readAndClearState('google-drive');

  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) return fail(providerError);
  if (!code) return fail('missing_code');
  if (!verifyState(expectedState, receivedState)) return fail('invalid_state');

  try {
    const user = await requireUser();
    // Reuse the EXACT redirect_uri sent at /authorize time. Google enforces
    // a byte-for-byte match between authorize and token requests; falling
    // back to a freshly-derived URI here is what produces a mismatch on
    // preview deployments and custom domains.
    const redirectUri = storedRedirect ?? getRedirectUri('google-drive', request);
    const tokens = await exchangeGoogleCode(code, 'google-drive', redirectUri);
    const info = await fetchGoogleUserInfo(tokens.access_token);

    await upsertCloudConnection({
      user_id: user.id,
      provider: 'google_drive',
      account_id: info.id,
      account_email: info.email,
      account_name: info.name,
      account_avatar_url: info.picture,
      tokens,
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=google_drive`, request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'oauth_failed';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail(msg);
  }
}
