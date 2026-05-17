// =============================================================================
// Arrowhead 7 — YouTube: OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeYouTubeCode,
  fetchYouTubeChannel,
} from '@/lib/distribute/youtube';
import {
  getRedirectUri,
  readAndClearState,
  readOAuthState,
  verifyState,
} from '@/lib/oauth/state';
import { upsertChannel } from '@/lib/oauth/store';
import { resolveOAuthCallbackUser } from '@/lib/oauth/callback-user';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const receivedState = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const signedState = readOAuthState('youtube', receivedState);
  const {
    state: expectedState,
    nextPath: cookieNextPath,
    redirectUri: cookieRedirect,
    userId: cookieUserId,
  } =
    await readAndClearState('youtube');
  const nextPath = signedState?.nextPath ?? cookieNextPath;
  const storedRedirect = signedState?.redirectUri ?? cookieRedirect;
  const userId = cookieUserId ?? signedState?.userId ?? null;
  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) return fail(providerError);
  if (!code) return fail('missing_code');
  if (!verifyState(expectedState, receivedState) && !signedState) return fail('invalid_state');

  try {
    const user = await resolveOAuthCallbackUser(userId);
    const redirectUri = storedRedirect ?? getRedirectUri('youtube', request);
    const tokens = await exchangeYouTubeCode(code, 'youtube', redirectUri);
    const channel = await fetchYouTubeChannel(tokens.access_token);

    await upsertChannel({
      user_id: user.id,
      platform: 'youtube',
      platform_account_id: channel.id,
      platform_account_name: channel.title,
      platform_avatar_url: channel.thumbnailUrl,
      tokens,
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=youtube`, request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'oauth_failed';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail(msg);
  }
}
