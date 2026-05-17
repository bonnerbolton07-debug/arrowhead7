// =============================================================================
// Arrowhead 7 — Profile Repair Helpers
// =============================================================================
// OAuth callbacks and other server-only flows occasionally need to write rows
// that reference public.profiles immediately after auth. This helper preserves
// existing plan/credit fields while repairing a missing profile row.

import type { User } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';

export async function ensureProfileForUser(user: User): Promise<void> {
  const email = user.email ?? `${user.id}@unknown.arrowhead7.local`;
  const displayName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === 'string'
      ? user.user_metadata.name
      : email;

  const { error } = await getAdminClient()
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) {
    throw new Error(`Failed to ensure profile: ${error.message}`);
  }
}
