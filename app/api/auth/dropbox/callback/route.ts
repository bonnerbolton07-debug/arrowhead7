// =============================================================================
// Arrowhead 7 — Dropbox: OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { exchangeDropboxCode, fetchDropboxAccount } from '@/lib/cloud/dropbox';
import { getRedirectUri, readAndClearState, verifyState } from '@/lib/oauth/state';
import { upsertCloudConnection } from '@/lib/oauth/store';
import { ensureProfileForUser } from '@/lib/supabase/profile';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const receivedState = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const { state: expectedState, nextPath, redirectUri: storedRedirect } =
    await readAndClearState('dropbox');
  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) return fail(providerError);
  if (!code) return fail('missing_code');
  if (!verifyState(expectedState, receivedState)) return fail('invalid_state');

  try {
    const user = await requireUser();
    await ensureProfileForUser(user);
    const redirectUri = storedRedirect ?? getRedirectUri('dropbox', request);
    const tokens = await exchangeDropboxCode(code, redirectUri);
    const account = await fetchDropboxAccount(tokens.access_token);

    await upsertCloudConnection({
      user_id: user.id,
      provider: 'dropbox',
      account_id: account.account_id,
      account_email: account.email,
      account_name: account.name?.display_name,
      account_avatar_url: account.profile_photo_url,
      tokens,
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=dropbox`, request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'oauth_failed';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail(msg);
  }
}
