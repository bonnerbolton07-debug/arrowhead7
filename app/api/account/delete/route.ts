// =============================================================================
// Arrowhead 7 — Delete Account
// =============================================================================
// POST /api/account/delete
// Cancels any active Stripe subscription, then deletes the auth.users row.
// Cascade deletes propagate to profiles/edits/etc. via the schema FK rules.

import { NextResponse } from 'next/server';
import { requireUser, createServerSupabaseClient } from '@/lib/supabase/server';
import { getAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await requireUser();
    const supabase = await createServerSupabaseClient();

    // Cancel active Stripe subscription (best-effort).
    if (isStripeConfigured()) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_subscription_id')
        .eq('id', user.id)
        .single();
      if (profile?.stripe_subscription_id) {
        try {
          await getStripe().subscriptions.cancel(profile.stripe_subscription_id);
        } catch (e) {
          console.warn('Stripe cancel during account delete failed:', e);
        }
      }
    }

    // Delete the auth user — cascades to profiles + everything else.
    if (isAdminConfigured()) {
      const { error } = await getAdminClient().auth.admin.deleteUser(user.id);
      if (error) {
        console.error('Failed to delete auth user:', error);
        return NextResponse.json(
          { error: 'Account deletion failed.' },
          { status: 500 }
        );
      }
    } else {
      // Without service role we can't delete the auth.users row. Soft-mark the
      // profile so we know not to serve it any more.
      await supabase
        .from('profiles')
        .update({
          display_name: 'Deleted user',
          email: `deleted+${user.id}@arrowhead7.local`,
          avatar_url: null,
        })
        .eq('id', user.id);
    }

    // Sign out the cookie session.
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
