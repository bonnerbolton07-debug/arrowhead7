// =============================================================================
// Arrowhead 7 — Google Drive: OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
} from '@/lib/cloud/google-drive';
import {
  getRedirectUri,
  readAndClearState,
  readOAuthState,
  verifyState,
} from '@/lib/oauth/state';
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

  const signedState = readOAuthState('google-drive', receivedState);
  const {
    state: expectedState,
    nextPath: cookieNextPath,
    redirectUri: cookieRedirect,
    userId: cookieUserId,
  } =
    await readAndClearState('google-drive');
  const nextPath = signedState?.nextPath ?? cookieNextPath;
  const storedRedirect = signedState?.redirectUri ?? cookieRedirect;
  const userId = cookieUserId ?? signedState?.userId ?? null;
  logOAuthEvent('google_drive', 'callback_received', {
    hasCode: Boolean(code),
    hasState: Boolean(receivedState),
    hasStoredState: Boolean(expectedState),
    hasSignedState: Boolean(signedState),
    hasStoredUser: Boolean(userId),
    userTail: userTail(userId),
  });

  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) {
    logOAuthEvent('google_drive', 'provider_error', { providerError });
    return fail(providerError);
  }
  if (!code) {
    logOAuthEvent('google_drive', 'missing_code');
    return fail('missing_code');
  }
  if (!verifyState(expectedState, receivedState) && !signedState) {
    logOAuthEvent('google_drive', 'invalid_state', {
      hasStoredState: Boolean(expectedState),
      hasSignedState: Boolean(signedState),
      hasReceivedState: Boolean(receivedState),
    });
    return fail('invalid_state');
  }

  try {
    const user = await resolveOAuthCallbackUser(userId);
    await ensureProfileForUser(user);
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

    logOAuthEvent('google_drive', 'connection_saved', {
      userTail: userTail(user.id),
      hasAccountId: Boolean(info.id),
      hasEmail: Boolean(info.email),
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=google_drive`, request.url)
    );
  } catch (e) {
    const msg = oauthErrorCode(e);
    logOAuthEvent('google_drive', 'callback_failed', {
      error: msg === 'Unauthorized' ? 'Unauthorized' : 'cloud_connection_failed',
      userTail: userTail(userId),
    });
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail('cloud_connection_failed');
  }
}
