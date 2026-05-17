// =============================================================================
// Arrowhead 7 — X (Twitter): OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { exchangeXCode, fetchXUser } from '@/lib/distribute/x';
import { getRedirectUri, readAndClearState, verifyState } from '@/lib/oauth/state';
import { upsertChannel } from '@/lib/oauth/store';
import { resolveOAuthCallbackUser } from '@/lib/oauth/callback-user';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const receivedState = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const {
    state: expectedState,
    verifier,
    nextPath,
    redirectUri: storedRedirect,
    userId,
  } =
    await readAndClearState('x');
  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) return fail(providerError);
  if (!code) return fail('missing_code');
  if (!verifier) return fail('missing_verifier');
  if (!verifyState(expectedState, receivedState)) return fail('invalid_state');

  try {
    const user = await resolveOAuthCallbackUser(userId);
    const redirectUri = storedRedirect ?? getRedirectUri('x', request);
    const tokens = await exchangeXCode({ code, verifier, redirectUri });
    const info = await fetchXUser(tokens.access_token);

    await upsertChannel({
      user_id: user.id,
      platform: 'twitter',
      platform_account_id: info.id,
      platform_account_name: info.username ? `@${info.username}` : (info.name ?? 'X account'),
      platform_avatar_url: info.profile_image_url,
      tokens,
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=twitter`, request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'oauth_failed';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail(msg);
  }
}
