// =============================================================================
// Arrowhead 7 — Instagram: OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeInstagramCode,
  exchangeForLongLivedToken,
  findInstagramAccount,
} from '@/lib/distribute/instagram';
import { getRedirectUri, readAndClearState, verifyState } from '@/lib/oauth/state';
import { upsertChannel } from '@/lib/oauth/store';
import { resolveOAuthCallbackUser } from '@/lib/oauth/callback-user';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const receivedState = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const { state: expectedState, nextPath, redirectUri: storedRedirect, userId } =
    await readAndClearState('instagram');
  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) return fail(providerError);
  if (!code) return fail('missing_code');
  if (!verifyState(expectedState, receivedState)) return fail('invalid_state');

  try {
    const user = await resolveOAuthCallbackUser(userId);
    const redirectUri = storedRedirect ?? getRedirectUri('instagram', request);
    const shortLived = await exchangeInstagramCode(code, redirectUri);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    const account = await findInstagramAccount(longLived.access_token);
    if (!account) return fail('no_instagram_business_account');

    // Store the page access token (used for content publishing) under the
    // IG business account id so we can look it up later.
    await upsertChannel({
      user_id: user.id,
      platform: 'instagram',
      platform_account_id: account.ig_user_id,
      platform_account_name: account.username ?? 'Instagram account',
      platform_avatar_url: account.profile_picture_url,
      tokens: {
        access_token: account.page_access_token,
        refresh_token: longLived.access_token, // user token, used to refresh page tokens
        expires_in: longLived.expires_in,
        scope: longLived.scope,
      },
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=instagram`, request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'oauth_failed';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail(msg);
  }
}
