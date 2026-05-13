// =============================================================================
// Arrowhead 7 — Stripe Customer Helpers
// =============================================================================
// Look up or create the Stripe customer for an authenticated user, persisting
// the customer ID back to the profiles row so we only ever create one.

import type { User } from '@supabase/supabase-js';
import { getStripe } from './client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Get the Stripe customer ID for this user, creating one if it doesn't exist.
 * Always persists to profiles.stripe_customer_id on the first call.
 */
export async function getOrCreateCustomerId(user: User): Promise<string> {
  const supabase = await createServerSupabaseClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email, display_name')
    .eq('id', user.id)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? profile?.email ?? undefined,
    name: profile?.display_name ?? undefined,
    metadata: { supabase_user_id: user.id },
  });

  await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id);

  return customer.id;
}
