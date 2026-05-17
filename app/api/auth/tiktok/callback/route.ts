// =============================================================================
// Arrowhead 7 — TikTok: OAuth Callback
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { exchangeTikTokCode, fetchTikTokUser } from '@/lib/distribute/tiktok';
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
    await readAndClearState('tiktok');
  const fail = (msg: string) =>
    NextResponse.redirect(
      new URL(`${nextPath}?error=${encodeURIComponent(msg)}`, request.url)
    );

  if (providerError) return fail(providerError);
  if (!code) return fail('missing_code');
  if (!verifyState(expectedState, receivedState)) return fail('invalid_state');

  try {
    const user = await resolveOAuthCallbackUser(userId);
    const redirectUri = storedRedirect ?? getRedirectUri('tiktok', request);
    const tokens = await exchangeTikTokCode(code, redirectUri);
    const info = await fetchTikTokUser(tokens.access_token);

    await upsertChannel({
      user_id: user.id,
      platform: 'tiktok',
      platform_account_id: info.open_id,
      platform_account_name: info.display_name ?? 'TikTok account',
      platform_avatar_url: info.avatar_url,
      tokens,
    });

    return NextResponse.redirect(
      new URL(`${nextPath}?connected=tiktok`, request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'oauth_failed';
    if (msg === 'Unauthorized') {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return fail(msg);
  }
}
