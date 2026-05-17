// =============================================================================
// Arrowhead 7 — OAuth Callback User Resolver
// =============================================================================
// Provider redirects can occasionally return without the normal Supabase
// session cookie, especially on mobile browser handoffs. OAuth state still
// protects the round-trip; this helper falls back to the signed connect-time
// user id so the provider account can be persisted to the right A7 user.

import type { User } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import { getUser } from '@/lib/supabase/server';

export async function resolveOAuthCallbackUser(
  signedStateUserId: string | null
): Promise<User> {
  const sessionUser = await getUser();
  if (sessionUser) return sessionUser;

  if (signedStateUserId) {
    const { data, error } = await getAdminClient().auth.admin.getUserById(
      signedStateUserId
    );
    if (!error && data.user) return data.user;
  }

  throw new Error('Unauthorized');
}

export function userTail(userId: string | null | undefined): string | null {
  return userId ? userId.slice(-8) : null;
}
