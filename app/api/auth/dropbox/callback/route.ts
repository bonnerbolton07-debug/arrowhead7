// =============================================================================
// Arrowhead 7 — Dropbox: OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { exchangeDropboxCode, fetchDropboxAccount } from '@/lib/cloud/dropbox';
import { getRedirectUri, readAndClearState, verifyState } from '@/lib/oauth/state';
import { upsertCloudConnection } from '@/lib/oauth/store';
import { ensureProfileForUser } from '@/lib/supabase/profile';
import { resolveOAuthCallbackUser, userTail } from '@/lib/oauth/callback-user';
import { logOAuthEvent, oauthErrorCode } from '@/lib/oauth/log';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const receivedState = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const { state: expectedState, nextPath, redirectUri: storedRedirect, userId } =
    await readAndClearState('dropbox');
  logOAuthEvent('dropbox', 'callback_received', {
    hasCode: Boolean(code),
    hasState: Boolean(receivedState),
    hasStoredState: Boolean(expectedState),
    hasStoredUser: Boolean(userId),
    userTail: userTail(userId),
  });
  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) {
    logOAuthEvent('dropbox', 'provider_error', { providerError });
    return fail(providerError);
  }
  if (!code) {
    logOAuthEvent('dropbox', 'missing_code');
    return fail('missing_code');
  }
  if (!verifyState(expectedState, receivedState)) {
    logOAuthEvent('dropbox', 'invalid_state', {
      hasStoredState: Boolean(expectedState),
      hasReceivedState: Boolean(receivedState),
    });
    return fail('invalid_state');
  }

  try {
    const user = await resolveOAuthCallbackUser(userId);
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

    logOAuthEvent('dropbox', 'connection_saved', {
      userTail: userTail(user.id),
      hasAccountId: Boolean(account.account_id),
      hasEmail: Boolean(account.email),
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=dropbox`, request.url)
    );
  } catch (e) {
    const msg = oauthErrorCode(e);
    logOAuthEvent('dropbox', 'callback_failed', {
      error: msg === 'Unauthorized' ? 'Unauthorized' : 'cloud_connection_failed',
      userTail: userTail(userId),
    });
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail('cloud_connection_failed');
  }
}
